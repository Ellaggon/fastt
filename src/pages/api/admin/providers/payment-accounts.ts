import type { APIRoute } from "astro"

import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	IdempotencyConflictError,
	idempotencyKeyFromRequest,
} from "@/lib/commands/command-idempotency"
import {
	executeSensitiveCommand,
	type SensitiveCommandAudit,
} from "@/lib/commands/sensitive-command"
import { requestIdFromRequest, withRequestId } from "@/lib/http/request-context"
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
	const requestId = requestIdFromRequest(request)
	try {
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
		const action = payload.action === "initiate_micro_deposit" ? "initiate_micro_deposit" : "review"
		const audit: SensitiveCommandAudit = {
			requestId,
			providerId: payload.providerId,
			action: `provider.payment_account.${action}`,
			entityType: "ProviderPaymentAccount",
			entityId: payload.accountId,
			riskLevel: "high",
		}
		const command = await executeSensitiveCommand({
			audit,
			idempotency: {
				scope: `provider.payment_account.${action}`,
				key: idempotencyKeyFromRequest(request),
				payload: {
					providerId: payload.providerId,
					accountId: payload.accountId,
					action,
					status: payload.status,
					reason: payload.reason ?? null,
				},
			},
			authorize: async () => {
				const principal = await requireInternalPermission(request, "provider.payment.review", {
					type: "provider",
					id: payload.providerId,
				})
				audit.actorUserId = principal.user.id
				audit.actorRoleKeys = principal.roles
				await requireRecentInternalAuthentication({ request, user: principal.user })
			},
			execute: async () => {
				const actorUserId = audit.actorUserId
				if (!actorUserId) throw new Error("sensitive_command_actor_missing")
				if (action === "initiate_micro_deposit") {
					const result = await initiatePaymentAccountMicroDeposit({
						providerId: payload.providerId,
						actorUserId,
						accountId: payload.accountId,
					})
					await invalidateProvider(payload.providerId)
					await invalidateProviderGovernance(
						payload.providerId,
						"admin_payment_micro_deposit_started"
					)
					return { response: { ok: true, ...result }, afterJson: { action } }
				}
				const account = await reviewProviderPaymentAccount({
					providerId: payload.providerId,
					actorUserId,
					accountId: payload.accountId,
					status: payload.status,
					reason: payload.reason,
				})
				await invalidateProvider(payload.providerId)
				await invalidateProviderGovernance(payload.providerId, "admin_payment_account_reviewed")
				return { response: { ok: true, account }, afterJson: { status: payload.status } }
			},
		})

		return withRequestId(
			new Response(JSON.stringify({ ...command.response, idempotent: command.replayed }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
			requestId
		)
	} catch (e) {
		if (e instanceof Response) return withRequestId(e, requestId)
		if (e instanceof IdempotencyConflictError) {
			return withRequestId(
				new Response(JSON.stringify({ error: e.code }), {
					status: 409,
					headers: { "Content-Type": "application/json" },
				}),
				requestId
			)
		}
		const status =
			typeof (e as Error & { status?: number })?.status === "number"
				? (e as Error & { status?: number }).status!
				: 500
		const msg = e instanceof Error ? e.message : "Unknown error"
		return withRequestId(
			new Response(JSON.stringify({ error: msg }), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
			requestId
		)
	}
}
