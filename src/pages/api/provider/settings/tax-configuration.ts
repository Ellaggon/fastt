import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	getProviderTaxConfiguration,
	providerInvoicingModes,
	providerTaxConfigurationStatuses,
	providerTaxRegimes,
	upsertProviderTaxConfiguration,
} from "@/lib/provider-tax-configuration"
import { resolveProviderPermissions } from "@/lib/provider-permissions"
import { and, db, eq, ProviderUser } from "astro:db"

const upsertSchema = z.object({
	status: z.enum(["not_configured", "pending", "verified", "requires_attention"]),
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

async function resolvePermissions(providerId: string, userId: string) {
	const link = await db
		.select({ role: ProviderUser.role, permissionsJson: ProviderUser.permissionsJson })
		.from(ProviderUser)
		.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
		.get()
	return resolveProviderPermissions({
		role: link?.role,
		permissionsJson: link?.permissionsJson,
	})
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.id) return json({ error: "unauthorized" }, 401)

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) return json({ error: "provider_not_found" }, 404)

		const taxConfiguration = await getProviderTaxConfiguration(providerId)
		const permissions = await resolvePermissions(providerId, user.id)

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
		return json({ error: String(err?.message || "Unknown error") }, 400)
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.id) return json({ error: "unauthorized" }, 401)

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) return json({ error: "provider_not_found" }, 404)

		const form = await request.formData()
		const parsed = upsertSchema.parse({
			status: form.get("status") || "not_configured",
			taxResidenceCountry: form.get("taxResidenceCountry") ?? "",
			businessRegistrationNumber: form.get("businessRegistrationNumber") ?? "",
			taxRegime: form.get("taxRegime") ?? "",
			invoicingMode: form.get("invoicingMode") || "platform_receipt",
		})

		const taxConfiguration = await upsertProviderTaxConfiguration({
			providerId,
			actorUserId: user.id,
			status: parsed.status,
			taxResidenceCountry: parsed.taxResidenceCountry,
			businessRegistrationNumber: parsed.businessRegistrationNumber,
			taxRegime: parsed.taxRegime,
			invoicingMode: parsed.invoicingMode,
		})

		return shouldReturnHtmlRedirect(request)
			? redirectToTaxFees(request, "tax_profile_saved")
			: json({ ok: true, taxConfiguration })
	} catch (err: any) {
		if (err instanceof ZodError)
			return json({ error: "validation_error", details: err.issues }, 400)
		const status = typeof err?.status === "number" ? err.status : 400
		return json({ error: String(err?.message || "Unknown error") }, status)
	}
}
