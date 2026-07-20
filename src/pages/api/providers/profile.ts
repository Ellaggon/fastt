import type { APIRoute } from "astro"
import {
	and,
	db,
	eq,
	ProviderAuditLog,
	ProviderPaymentAccount,
	ProviderTaxConfiguration,
} from "astro:db"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProvider } from "@/lib/cache/invalidation"
import { providerV2Repository } from "@/container"
import { upsertProviderProfileV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"

function shouldReturnHtmlRedirect(request: Request): boolean {
	const accept = (request.headers.get("accept") || "").toLowerCase()
	return accept.includes("text/html")
}

function fiscalStatusToTaxConfigurationStatus(value: string | undefined) {
	if (value === "verified") return "verified"
	if (value === "pending") return "pending"
	if (value === "requires_attention") return "requires_attention"
	return "not_configured"
}

function paymentReadinessToPaymentAccountStatus(value: string | undefined) {
	if (value === "verified") return "verified"
	if (value === "pending") return "pending"
	if (value === "requires_attention") return "requires_attention"
	return "not_configured"
}

async function upsertProviderTaxConfiguration(params: {
	providerId: string
	actorUserId?: string | null
	taxResidenceCountry?: string | null
	businessRegistrationNumber?: string | null
	fiscalStatus?: string
}) {
	const now = new Date()
	const values = {
		providerId: params.providerId,
		status: fiscalStatusToTaxConfigurationStatus(params.fiscalStatus),
		taxResidenceCountry: params.taxResidenceCountry ?? undefined,
		businessRegistrationNumber: params.businessRegistrationNumber ?? undefined,
		updatedAt: now,
		updatedBy: params.actorUserId ?? undefined,
	}

	await db
		.insert(ProviderTaxConfiguration)
		.values(values)
		.onConflictDoUpdate({
			target: [ProviderTaxConfiguration.providerId],
			set: {
				status: values.status,
				taxResidenceCountry: values.taxResidenceCountry,
				businessRegistrationNumber: values.businessRegistrationNumber,
				updatedAt: values.updatedAt,
				updatedBy: values.updatedBy,
			},
		})
}

async function upsertProviderPaymentAccountFromReadiness(params: {
	providerId: string
	defaultCurrency: string
	paymentReadinessStatus?: string
}) {
	const now = new Date()
	const provider = "manual_profile"
	const existing = await db
		.select({ id: ProviderPaymentAccount.id })
		.from(ProviderPaymentAccount)
		.where(
			and(
				eq(ProviderPaymentAccount.providerId, params.providerId),
				eq(ProviderPaymentAccount.provider, provider)
			)
		)
		.get()
		.catch(() => null)
	const status = paymentReadinessToPaymentAccountStatus(params.paymentReadinessStatus)
	const values = {
		providerId: params.providerId,
		status,
		provider,
		currency: params.defaultCurrency,
		accountReference: status === "not_configured" ? undefined : "profile-readiness",
		payoutSchedule: "manual",
		verifiedAt: status === "verified" ? now : undefined,
		updatedAt: now,
	}

	if (existing?.id) {
		await db
			.update(ProviderPaymentAccount)
			.set(values)
			.where(eq(ProviderPaymentAccount.id, existing.id))
		return existing.id
	}

	const id = crypto.randomUUID()
	await db.insert(ProviderPaymentAccount).values({
		id,
		...values,
		createdAt: now,
	})
	return id
}

export const handleProviderProfilePost: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Provider not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const raw = {
			timezone: String(form.get("timezone") ?? "").trim(),
			defaultCurrency: String(form.get("defaultCurrency") ?? "").trim(),
			supportEmail: String(form.get("supportEmail") ?? "").trim() || undefined,
			supportPhone: String(form.get("supportPhone") ?? "").trim() || undefined,
			taxResidenceCountry:
				String(form.get("taxResidenceCountry") ?? "")
					.trim()
					.toUpperCase() || undefined,
			businessRegistrationNumber:
				String(form.get("businessRegistrationNumber") ?? "").trim() || undefined,
			fiscalStatus: String(form.get("fiscalStatus") ?? "").trim() || undefined,
			paymentReadinessStatus: String(form.get("paymentReadinessStatus") ?? "").trim() || undefined,
			integrationReadinessStatus:
				String(form.get("integrationReadinessStatus") ?? "").trim() || undefined,
		}

		const result = await upsertProviderProfileV2(
			{ repo: providerV2Repository },
			{
				providerId,
				timezone: raw.timezone,
				defaultCurrency: raw.defaultCurrency,
				supportEmail: raw.supportEmail,
				supportPhone: raw.supportPhone,
			}
		)
		await upsertProviderTaxConfiguration({
			providerId,
			actorUserId: user.id,
			taxResidenceCountry: raw.taxResidenceCountry,
			businessRegistrationNumber: raw.businessRegistrationNumber,
			fiscalStatus: raw.fiscalStatus,
		})
		await upsertProviderPaymentAccountFromReadiness({
			providerId,
			defaultCurrency: raw.defaultCurrency,
			paymentReadinessStatus: raw.paymentReadinessStatus,
		})
		await invalidateProvider(providerId)
		await db
			.insert(ProviderAuditLog)
			.values({
				id: crypto.randomUUID(),
				providerId,
				actorUserId: user.id,
				action: "provider.profile.upsert",
				entityType: "ProviderProfile",
				entityId: providerId,
				afterJson: raw,
				riskLevel:
					raw.fiscalStatus || raw.paymentReadinessStatus || raw.integrationReadinessStatus
						? "medium"
						: "low",
				createdAt: new Date(),
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : String(error)
				if (!message.includes("ProviderAuditLog") && !message.includes("no such table")) {
					throw error
				}
			})

		if (shouldReturnHtmlRedirect(request)) {
			const url = new URL("/provider/settings/profile?success=saved", request.url)
			return Response.redirect(url, 303)
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ValidationError) {
			return new Response(JSON.stringify({ error: "validation_error", errors: e.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		const status = msg.includes("Provider not found") ? 404 : 500
		return new Response(JSON.stringify({ error: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const POST: APIRoute = handleProviderProfilePost
export const PATCH: APIRoute = handleProviderProfilePost
