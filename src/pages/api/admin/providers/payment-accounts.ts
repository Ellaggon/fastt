import type { APIRoute } from "astro"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import { invalidateProvider } from "@/lib/cache/invalidation"
import {
	initiatePaymentAccountMicroDeposit,
	reviewProviderPaymentAccount,
} from "@/lib/provider-payment-accounts"

async function readPayload(request: Request): Promise<{
	providerId: string
	accountId: string
	status: string
	reason?: string
	action?: string
}> {
	const contentType = (request.headers.get("content-type") || "").toLowerCase()

	if (contentType.includes("application/json")) {
		const body = (await request.json()) as Record<string, unknown>
		return {
			providerId: String(body.providerId ?? "").trim(),
			accountId: String(body.accountId ?? body.id ?? "").trim(),
			status: String(body.status ?? "").trim(),
			reason: String(body.reason ?? body.reviewNotes ?? "").trim() || undefined,
			action: String(body.action ?? "").trim() || undefined,
		}
	}

	const form = await request.formData()
	return {
		providerId: String(form.get("providerId") ?? "").trim(),
		accountId: String(form.get("accountId") ?? form.get("id") ?? "").trim(),
		status: String(form.get("status") ?? "").trim(),
		reason: String(form.get("reason") ?? form.get("reviewNotes") ?? "").trim() || undefined,
		action: String(form.get("action") ?? "").trim() || undefined,
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user } = await requireInternalAdmin(request)
		const payload = await readPayload(request)

		if (!payload.providerId) {
			return new Response(JSON.stringify({ error: "providerId is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (!payload.accountId) {
			return new Response(JSON.stringify({ error: "accountId is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (payload.action === "initiate_micro_deposit") {
			const result = await initiatePaymentAccountMicroDeposit({
				providerId: payload.providerId,
				actorUserId: user.id,
				accountId: payload.accountId,
			})
			await invalidateProvider(payload.providerId)
			return new Response(JSON.stringify({ ok: true, ...result }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		}

		const account = await reviewProviderPaymentAccount({
			providerId: payload.providerId,
			actorUserId: user.id,
			accountId: payload.accountId,
			status: payload.status,
			reason: payload.reason,
		})

		await invalidateProvider(payload.providerId)

		return new Response(JSON.stringify({ ok: true, account }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof Response) return e
		const status =
			typeof (e as Error & { status?: number })?.status === "number"
				? (e as Error & { status?: number }).status!
				: 500
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}
