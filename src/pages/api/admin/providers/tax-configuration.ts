import type { APIRoute } from "astro"

import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	resolveComplianceCaseForSourceCompat,
	synchronizeComplianceCaseCompat,
} from "@/lib/casework/compliance-casework"
import {
	IdempotencyConflictError,
	idempotencyKeyFromRequest,
} from "@/lib/commands/command-idempotency"
import {
	executeSensitiveCommand,
	type SensitiveCommandAudit,
} from "@/lib/commands/sensitive-command"
import { requestIdFromRequest, withRequestId } from "@/lib/http/request-context"
import { reviewProviderTaxConfiguration } from "@/lib/provider-tax-configuration"

async function readPayload(request: Request): Promise<{
	providerId: string
	status: string
	reason?: string
}> {
	const contentType = (request.headers.get("content-type") || "").toLowerCase()

	if (contentType.includes("application/json")) {
		const body = (await request.json()) as Record<string, unknown>
		return {
			providerId: String(body.providerId ?? "").trim(),
			status: String(body.status ?? "").trim(),
			reason: String(body.reason ?? "").trim() || undefined,
		}
	}

	const form = await request.formData()
	return {
		providerId: String(form.get("providerId") ?? "").trim(),
		status: String(form.get("status") ?? "").trim(),
		reason: String(form.get("reason") ?? "").trim() || undefined,
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
		const audit: SensitiveCommandAudit = {
			requestId,
			providerId: payload.providerId,
			action: "provider.tax_configuration.review",
			entityType: "ProviderTaxConfiguration",
			entityId: payload.providerId,
			riskLevel: "high",
		}
		const command = await executeSensitiveCommand({
			audit,
			idempotency: {
				scope: "provider.tax_configuration.review",
				key: idempotencyKeyFromRequest(request),
				payload: {
					providerId: payload.providerId,
					status: payload.status,
					reason: payload.reason ?? null,
				},
			},
			authorize: async () => {
				const principal = await requireInternalPermission(request, "provider.fiscal.review", {
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
				await synchronizeComplianceCaseCompat({
					providerId: payload.providerId,
					domain: "fiscal",
					sourceType: "ProviderTaxConfiguration",
					sourceRef: payload.providerId,
					summary: "Revisión de identidad fiscal",
				})
				const taxConfiguration = await reviewProviderTaxConfiguration({
					providerId: payload.providerId,
					actorUserId,
					status: payload.status,
					reason: payload.reason,
				})
				if (payload.status === "verified" || payload.status === "requires_attention")
					await resolveComplianceCaseForSourceCompat(
						{
							providerId: payload.providerId,
							domain: "fiscal",
							sourceType: "ProviderTaxConfiguration",
							sourceRef: payload.providerId,
						},
						payload.status === "verified" ? "requirements_satisfied" : "information_mismatch"
					)
				await invalidateProvider(payload.providerId)
				await invalidateProviderGovernance(payload.providerId, "admin_tax_configuration_reviewed")
				return {
					response: { ok: true, taxConfiguration },
					afterJson: { status: payload.status },
				}
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
