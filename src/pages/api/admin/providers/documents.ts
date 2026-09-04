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
import { reviewProviderDocument } from "@/lib/provider-documents"

async function readPayload(request: Request): Promise<{
	providerId: string
	documentId: string
	status: string
	reviewNotes?: string
}> {
	const contentType = (request.headers.get("content-type") || "").toLowerCase()

	if (contentType.includes("application/json")) {
		const body = (await request.json()) as Record<string, unknown>
		return {
			providerId: String(body.providerId ?? "").trim(),
			documentId: String(body.documentId ?? body.id ?? "").trim(),
			status: String(body.status ?? "").trim(),
			reviewNotes: String(body.reviewNotes ?? body.reason ?? "").trim() || undefined,
		}
	}

	const form = await request.formData()
	return {
		providerId: String(form.get("providerId") ?? "").trim(),
		documentId: String(form.get("documentId") ?? form.get("id") ?? "").trim(),
		status: String(form.get("status") ?? "").trim(),
		reviewNotes: String(form.get("reviewNotes") ?? form.get("reason") ?? "").trim() || undefined,
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
		if (!payload.documentId) {
			return new Response(JSON.stringify({ error: "documentId is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const audit: SensitiveCommandAudit = {
			requestId,
			providerId: payload.providerId,
			action: "provider.document.review",
			entityType: "ProviderDocument",
			entityId: payload.documentId,
			riskLevel: "high",
		}
		const command = await executeSensitiveCommand({
			audit,
			idempotency: {
				scope: "provider.document.review",
				key: idempotencyKeyFromRequest(request),
				payload: {
					providerId: payload.providerId,
					documentId: payload.documentId,
					status: payload.status,
					reviewNotes: payload.reviewNotes ?? null,
				},
			},
			authorize: async () => {
				const principal = await requireInternalPermission(request, "provider.document.review", {
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
					domain: "documents",
					sourceType: "ProviderDocument",
					sourceRef: payload.documentId,
					summary: "Revisión documental",
				})
				const document = await reviewProviderDocument({
					providerId: payload.providerId,
					actorUserId,
					documentId: payload.documentId,
					status: payload.status,
					reviewNotes: payload.reviewNotes,
				})
				if (payload.status === "verified" || payload.status === "rejected")
					await resolveComplianceCaseForSourceCompat(
						{
							providerId: payload.providerId,
							domain: "documents",
							sourceType: "ProviderDocument",
							sourceRef: payload.documentId,
						},
						payload.status === "verified" ? "requirements_satisfied" : "requirements_not_satisfied"
					)
				await invalidateProvider(payload.providerId)
				await invalidateProviderGovernance(payload.providerId, "admin_provider_document_reviewed")
				return {
					response: { ok: true, document },
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
