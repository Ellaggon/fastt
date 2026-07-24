import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	createProviderPaymentAccount,
	confirmPaymentAccountMicroDeposit,
	listProviderPaymentAccounts,
	providerPaymentAccountStatuses,
	providerPayoutMethods,
	providerPayoutSchedules,
} from "@/lib/provider-payment-accounts"

const createSchema = z.object({
	method: z.enum(["bank_transfer", "international_wire", "other"]).default("bank_transfer"),
	currency: z
		.string()
		.trim()
		.transform((value) => value.toUpperCase())
		.refine((value) => /^[A-Z]{3}$/.test(value), { message: "currency_must_be_iso3" }),
	accountHolderName: z.string().trim().min(2).max(160),
	bankName: z.string().trim().min(2).max(160),
	country: z
		.string()
		.trim()
		.transform((value) => value.toUpperCase())
		.refine((value) => /^[A-Z]{2}$/.test(value), { message: "country_must_be_iso2" }),
	routingOrSwift: z.string().trim().max(64).optional(),
	accountIdentifier: z.string().trim().min(4).max(64),
	payoutSchedule: z.enum(["manual", "weekly", "biweekly", "monthly"]).default("manual"),
	submissionNotes: z.string().trim().max(2000).optional(),
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

function redirectToPayments(request: Request, result: string) {
	return Response.redirect(
		new URL(`/provider/settings/payments?result=${result}`, request.url),
		303
	)
}

function redirectToPaymentsError(request: Request, error: string) {
	return Response.redirect(
		new URL(`/provider/settings/payments?error=${encodeURIComponent(error)}`, request.url),
		303
	)
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const { provider } = await requireProviderSessionSurface(request)
		const providerId = provider.providerId

		const accounts = await listProviderPaymentAccounts(providerId)
		const permissions = provider.permissions

		return json({
			accounts,
			statuses: providerPaymentAccountStatuses,
			methods: providerPayoutMethods,
			schedules: providerPayoutSchedules,
			permissions: {
				canManagePayments: permissions.canManagePayments,
			},
			counts: {
				total: accounts.length,
				pending: accounts.filter((row) => row.status === "pending").length,
				verified: accounts.filter((row) => row.status === "verified").length,
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
		const action = String(form.get("action") ?? "create")

		// Review is internal-admin only.
		if (action === "review") {
			return json(
				{
					error: "forbidden",
					message:
						"La verificación de cuentas de pago la realiza el equipo interno de Fastt. Usa /admin/providers.",
				},
				403
			)
		}

		if (action === "confirm_micro_deposit") {
			const account = await confirmPaymentAccountMicroDeposit({
				providerId,
				actorUserId: user.id,
				accountId: String(form.get("accountId") ?? form.get("id") ?? "").trim(),
				amount1Cents: form.get("amount1Cents"),
				amount2Cents: form.get("amount2Cents"),
			})
			await invalidateProvider(providerId)
			await invalidateProviderGovernance(providerId, "provider_payment_micro_deposit_confirmed")
			return shouldReturnHtmlRedirect(request)
				? redirectToPayments(request, "micro_deposit_confirmed")
				: json({ ok: true, account })
		}

		const parsed = createSchema.parse({
			method: form.get("method") || "bank_transfer",
			currency: form.get("currency") || "USD",
			accountHolderName: form.get("accountHolderName") ?? "",
			bankName: form.get("bankName") ?? "",
			country: form.get("country") ?? "",
			routingOrSwift: form.get("routingOrSwift") || undefined,
			accountIdentifier: form.get("accountIdentifier") ?? "",
			payoutSchedule: form.get("payoutSchedule") || "manual",
			submissionNotes: form.get("submissionNotes") || undefined,
		})

		const account = await createProviderPaymentAccount({
			providerId,
			actorUserId: user.id,
			method: parsed.method,
			currency: parsed.currency,
			accountHolderName: parsed.accountHolderName,
			bankName: parsed.bankName,
			country: parsed.country,
			routingOrSwift: parsed.routingOrSwift,
			accountIdentifier: parsed.accountIdentifier,
			payoutSchedule: parsed.payoutSchedule,
			submissionNotes: parsed.submissionNotes,
		})
		await invalidateProvider(providerId)
		await invalidateProviderGovernance(providerId, "provider_payment_account_created")

		return shouldReturnHtmlRedirect(request)
			? redirectToPayments(request, "submitted")
			: json({ ok: true, account }, 201)
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError)
			return json({ error: "validation_error", details: err.issues }, 400)
		const message = String(err?.message || "Unknown error")
		const status = typeof err?.status === "number" ? err.status : 400
		if (
			shouldReturnHtmlRedirect(request) &&
			(message.startsWith("micro_deposit_") || message === "invalid_micro_deposit_amounts")
		) {
			return redirectToPaymentsError(request, message)
		}
		return json({ error: message }, status)
	}
}
