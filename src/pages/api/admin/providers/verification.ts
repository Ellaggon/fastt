import type { APIRoute } from "astro"
import { providerV2Repository } from "@/container"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	resolveComplianceCaseForSourceCompat,
	synchronizeComplianceCaseCompat,
} from "@/lib/casework/compliance-casework"
import {
	executeSensitiveCommand,
	type SensitiveCommandAudit,
} from "@/lib/commands/sensitive-command"
import {
	IdempotencyConflictError,
	idempotencyKeyFromRequest,
} from "@/lib/commands/command-idempotency"
import { requestIdFromRequest, withRequestId } from "@/lib/http/request-context"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import { getLatestProviderVerificationStatus } from "@/lib/provider-admin-compliance"
import { ValidationError } from "@/lib/validation/ValidationError"
import { setProviderVerificationV2 } from "@/modules/catalog/public"

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
		if (payload.status !== "approved" && payload.status !== "rejected") {
			return new Response(JSON.stringify({ error: "status must be approved or rejected" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (payload.status === "rejected" && !payload.reason) {
			return new Response(JSON.stringify({ error: "reason is required when status is rejected" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const audit: SensitiveCommandAudit = {
			requestId,
			providerId: payload.providerId,
			action: "provider.verification.review",
			entityType: "ProviderVerification",
			entityId: payload.providerId,
			riskLevel: "high" as const,
		}
		let actorEmail: string | undefined
		const command = await executeSensitiveCommand({
			audit,
			idempotency: {
				scope: "provider.verification.review",
				key: idempotencyKeyFromRequest(request),
				payload: {
					providerId: payload.providerId,
					status: payload.status,
					reason: payload.reason ?? null,
				},
			},
			authorize: async () => {
				const principal = await requireInternalPermission(request, "provider.verification.review", {
					type: "provider",
					id: payload.providerId,
				})
				audit.actorUserId = principal.user.id
				audit.actorRoleKeys = principal.roles
				actorEmail = principal.user.email
				await requireRecentInternalAuthentication({ request, user: principal.user })
			},
			execute: async () => {
				const actorUserId = audit.actorUserId
				if (!actorUserId) throw new Error("sensitive_command_actor_missing")
				await synchronizeComplianceCaseCompat({
					providerId: payload.providerId,
					domain: "verification",
					sourceType: "ProviderVerification",
					sourceRef: payload.providerId,
					summary: "Revisión de identidad y negocio del proveedor",
				})

				const before = await getLatestProviderVerificationStatus(payload.providerId)
				const result = await setProviderVerificationV2(
					{ repo: providerV2Repository },
					{
						providerId: payload.providerId,
						status: payload.status,
						reason: payload.reason ?? null,
						reviewedByUserId: actorUserId,
						metadataJson: null,
					}
				)

				await writeProviderAuditLog({
					providerId: payload.providerId,
					actorUserId,
					action: "provider.verification.review",
					entityType: "ProviderVerification",
					entityId: payload.providerId,
					beforeJson: { status: before?.status ?? "pending", reason: before?.reason ?? null },
					afterJson: {
						status: payload.status,
						reason: payload.reason ?? null,
						reviewedBy: actorEmail,
					},
					riskLevel: "high",
				})

				const { completeComplianceAssignment } = await import("@/lib/provider-compliance-ops")
				await completeComplianceAssignment({
					providerId: payload.providerId,
					domain: "verification",
					entityId: payload.providerId,
				})
				await resolveComplianceCaseForSourceCompat(
					{
						providerId: payload.providerId,
						domain: "verification",
						sourceType: "ProviderVerification",
						sourceRef: payload.providerId,
					},
					payload.status === "approved" ? "requirements_satisfied" : "requirements_not_satisfied"
				)
				await invalidateProvider(payload.providerId)
				await invalidateProviderGovernance(
					payload.providerId,
					"admin_provider_verification_reviewed"
				)
				return {
					response: result,
					beforeJson: { status: before?.status ?? "pending", reason: before?.reason ?? null },
					afterJson: { status: payload.status, reason: payload.reason ?? null },
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
		if (e instanceof ValidationError) {
			return new Response(JSON.stringify({ error: "validation_error", errors: e.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const status =
			typeof (e as Error & { status?: unknown })?.status === "number"
				? (e as Error & { status: number }).status
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
