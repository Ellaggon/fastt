import type { APIRoute } from "astro"
import { copyVerificationNavigationQuery } from "@/lib/verification/navigation"
import { ZodError, z } from "zod"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	getProviderTaxConfiguration,
	providerInvoicingModes,
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
	invoicingMode: z.enum(["platform_receipt", "provider_invoice", "hybrid"]),
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

function fiscalRedirectPath(result: string, returnToRaw?: FormDataEntryValue | null): string {
	const returnTo = String(returnToRaw ?? "").trim()
	const base =
		returnTo === "taxIdentity"
			? routes.providerSettingsTaxIdentity()
			: routes.providerSettingsVerificationFiscal()
	const url = `${base}?result=${encodeURIComponent(result)}`
	return url
}

function redirectAfterFiscalSubmit(
	request: Request,
	result: string,
	returnToRaw?: FormDataEntryValue | null
) {
	return Response.redirect(
		copyVerificationNavigationQuery(
			new URL(fiscalRedirectPath(result, returnToRaw), request.url),
			new URL(request.url)
		),
		303
	)
}

function redirectAfterFiscalError(
	request: Request,
	error: string,
	returnToRaw?: FormDataEntryValue | null
) {
	const base =
		String(returnToRaw ?? "").trim() === "taxIdentity"
			? routes.providerSettingsTaxIdentity()
			: routes.providerSettingsVerificationFiscal()
	const target = new URL(base, request.url)
	target.searchParams.set("error", error)
	copyVerificationNavigationQuery(target, new URL(request.url))
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
			invoicingModes: providerInvoicingModes,
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
		const parsed = upsertSchema.parse({
			taxResidenceCountry: form.get("taxResidenceCountry") ?? "",
			businessRegistrationNumber: form.get("businessRegistrationNumber") ?? "",
			taxRegime: form.get("taxRegime") ?? "",
			invoicingMode: form.get("invoicingMode") || "platform_receipt",
		})

		// Status is derived server-side (pending | not_configured). Providers cannot self-verify.
		const taxConfiguration = await upsertProviderTaxConfiguration({
			providerId,
			actorUserId: user.id,
			taxResidenceCountry: parsed.taxResidenceCountry,
			businessRegistrationNumber: parsed.businessRegistrationNumber,
			taxRegime: parsed.taxRegime,
			invoicingMode: parsed.invoicingMode,
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
