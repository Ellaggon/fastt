import type { APIRoute } from "astro"
import {
	copyVerificationNavigationQuery,
	verificationSectionUrl,
} from "@/lib/verification/navigation"
import { ZodError, z } from "zod"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	getProviderTaxConfiguration,
	providerTaxConfigurationStatuses,
	providerTaxRegimes,
	upsertProviderTaxConfiguration,
} from "@/lib/provider-tax-configuration"
import { routes } from "@/lib/routes"

const upsertSchema = z.object({
	taxResidenceCountry: z
		.string()
		.trim()
		.transform((value) => value.toUpperCase())
		.refine((value) => value === "" || /^[A-Z]{2}$/.test(value), {
			message: "country_must_be_iso2",
		}),
	businessRegistrationNumber: z.string().trim().max(120),
	taxRegime: z.string().trim().max(80),
})

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/** Browser form navigation must 303 back to Verificación — never dump API JSON. */
function shouldReturnHtmlRedirect(request: Request) {
	const accept = (request.headers.get("accept") ?? "").toLowerCase()
	const fetchDest = request.headers.get("sec-fetch-dest") ?? ""
	const fetchMode = request.headers.get("sec-fetch-mode") ?? ""
	const contentType = request.headers.get("content-type") ?? ""
	const wantsJsonOnly = accept.includes("application/json") && !accept.includes("text/html")
	if (wantsJsonOnly) return false
	if (accept.includes("text/html")) return true
	if (fetchDest === "document" || fetchMode === "navigate") return true
	if (contentType.includes("multipart/form-data")) return true
	if (contentType.includes("application/x-www-form-urlencoded")) return true
	return false
}

function fiscalRedirectTarget(request: Request, returnToRaw?: FormDataEntryValue | null): URL {
	const source = new URL(request.url)
	return String(returnToRaw ?? "").trim() === "taxIdentity"
		? copyVerificationNavigationQuery(
				new URL(routes.providerSettingsTaxIdentity(), source),
				source,
				"fiscal"
			)
		: verificationSectionUrl(source, "fiscal")
}

export function redirectAfterFiscalSubmit(
	request: Request,
	result: string,
	returnToRaw?: FormDataEntryValue | null
) {
	const target = fiscalRedirectTarget(request, returnToRaw)
	target.searchParams.delete("error")
	target.searchParams.set("result", result)
	return Response.redirect(target, 303)
}

export function redirectAfterFiscalError(
	request: Request,
	error: string,
	returnToRaw?: FormDataEntryValue | null
) {
	const target = fiscalRedirectTarget(request, returnToRaw)
	target.searchParams.delete("result")
	target.searchParams.set("error", error)
	return Response.redirect(target, 303)
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const { provider } = await requireProviderSessionSurface(request)
		const providerId = provider.providerId

		const taxConfiguration = await getProviderTaxConfiguration(providerId)
		const permissions = provider.permissions

		return json({
			taxConfiguration,
			statuses: providerTaxConfigurationStatuses,
			taxRegimes: providerTaxRegimes,
			permissions: {
				canManageFiscality: permissions.canManageFiscality,
			},
		})
	} catch (err: any) {
		if (err instanceof Response) return err
		return json({ error: String(err?.message || "Unknown error") }, 400)
	}
}

export const POST: APIRoute = async ({ request }) => {
	let returnTo: FormDataEntryValue | null = null
	try {
		const { user, provider } = await requireProviderSessionSurface(request)
		const providerId = provider.providerId

		const form = await request.formData()
		returnTo = form.get("returnTo")
		// This fiscal identity endpoint cannot change a contractual issuer or enable
		// platform invoicing. Reject even an explicit legacy value before any write.
		if (form.has("invoicingMode")) {
			return shouldReturnHtmlRedirect(request)
				? redirectAfterFiscalError(request, "invoicing_mode_not_editable", returnTo)
				: json({ error: "invoicing_mode_not_editable" }, 422)
		}
		const parsed = upsertSchema.parse({
			taxResidenceCountry: form.get("taxResidenceCountry") ?? "",
			businessRegistrationNumber: form.get("businessRegistrationNumber") ?? "",
			taxRegime: form.get("taxRegime") ?? "",
		})

		// Status is derived server-side (pending | not_configured). Providers cannot self-verify.
		const taxConfiguration = await upsertProviderTaxConfiguration({
			providerId,
			actorUserId: user.id,
			taxResidenceCountry: parsed.taxResidenceCountry,
			businessRegistrationNumber: parsed.businessRegistrationNumber,
			taxRegime: parsed.taxRegime,
		})
		await invalidateProvider(providerId)
		await invalidateProviderGovernance(providerId, "provider_tax_configuration_updated")

		return shouldReturnHtmlRedirect(request)
			? redirectAfterFiscalSubmit(request, "tax_profile_saved", returnTo)
			: json({ ok: true, taxConfiguration })
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError) {
			return shouldReturnHtmlRedirect(request)
				? redirectAfterFiscalError(request, "validation_error", returnTo)
				: json({ error: "validation_error", details: err.issues }, 400)
		}
		const status = typeof err?.status === "number" ? err.status : 400
		const code = String(err?.code || err?.message || "tax_save_failed")
		const safeCode = /^[a-z0-9_]+$/i.test(code) ? code : "tax_save_failed"
		return shouldReturnHtmlRedirect(request)
			? redirectAfterFiscalError(request, safeCode, returnTo)
			: json({ error: safeCode }, status)
	}
}
