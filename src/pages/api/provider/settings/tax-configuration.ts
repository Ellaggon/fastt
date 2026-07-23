import type { APIRoute } from "astro"
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

function shouldReturnHtmlRedirect(request: Request) {
	const accept = request.headers.get("accept") ?? ""
	return accept.includes("text/html")
}

function redirectToTaxFees(request: Request, result: string) {
	return Response.redirect(
		new URL(`/provider/settings/tax-fees?result=${result}`, request.url),
		303
	)
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
	try {
		const { user, provider } = await requireProviderSessionSurface(request)
		const providerId = provider.providerId

		const form = await request.formData()
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
			? redirectToTaxFees(request, "tax_profile_saved")
			: json({ ok: true, taxConfiguration })
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError)
			return json({ error: "validation_error", details: err.issues }, 400)
		const status = typeof err?.status === "number" ? err.status : 400
		return json({ error: String(err?.message || "Unknown error") }, status)
	}
}
