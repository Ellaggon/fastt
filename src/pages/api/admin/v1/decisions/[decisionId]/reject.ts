import type { APIRoute } from "astro"

import { getFeatureFlag } from "@/config/featureFlags"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import {
	idempotencyKeyFromRequest,
	IdempotencyConflictError,
} from "@/lib/commands/command-idempotency"
import {
	executeSensitiveCommand,
	type SensitiveCommandAudit,
} from "@/lib/commands/sensitive-command"
import { requestIdFromRequest, withRequestId } from "@/lib/http/request-context"
import {
	rejectCaseDecisionApproval,
	getDecisionAuthorizationContext,
} from "@/modules/casework/public"

export const POST: APIRoute = async ({ request, params }) => {
	const requestId = requestIdFromRequest(request)
	try {
		if (!getFeatureFlag("COMMAND_CENTER_V2_COMMANDS_ENABLED", { request }))
			return withRequestId(
				Response.json({ error: "casework_commands_disabled" }, { status: 503 }),
				requestId
			)
		const body = (await request.json()) as Record<string, unknown>
		const decisionId = String(params.decisionId ?? "")
		const expectedCaseVersion = Number(body.caseVersion)
		const reason = String(body.reason ?? "").trim()
		const audit: SensitiveCommandAudit = {
			requestId,
			action: "case.decision.reject_high_risk",
			entityType: "CaseDecision",
			entityId: decisionId,
			riskLevel: "critical",
		}
		const command = await executeSensitiveCommand({
			audit,
			idempotency: {
				scope: "case.decision.reject_high_risk",
				key: idempotencyKeyFromRequest(request),
				payload: { decisionId, expectedCaseVersion, reason },
			},
			authorize: async () => {
				const principal = await requireInternalPermission(
					request,
					"case.decision.approve_high_risk"
				)
				const context = await getDecisionAuthorizationContext(decisionId)
				if (!context) throw Object.assign(new Error("case_decision_not_found"), { status: 404 })
				const permission = {
					verification: "provider.verification.review",
					fiscal: "provider.fiscal.review",
					documents: "provider.document.review",
					payments: "provider.payment.review",
				}[context.domain] as
					| "provider.verification.review"
					| "provider.fiscal.review"
					| "provider.document.review"
					| "provider.payment.review"
				await requireInternalPermission(request, permission, {
					type: "provider",
					id: context.providerId,
				})
				audit.actorUserId = principal.user.id
				audit.actorRoleKeys = principal.roles
				audit.providerId = context.providerId
				await requireRecentInternalAuthentication({ request, user: principal.user })
			},
			execute: async () => {
				if (!audit.actorUserId) throw new Error("sensitive_command_actor_missing")
				const result = await rejectCaseDecisionApproval({
					decisionId,
					expectedCaseVersion,
					actorUserId: audit.actorUserId,
					reason,
				})
				return { response: result, afterJson: result }
			},
		})
		return withRequestId(
			Response.json({ ok: true, ...command.response, idempotent: command.replayed }),
			requestId
		)
	} catch (error) {
		if (error instanceof Response) return withRequestId(error, requestId)
		if (error instanceof IdempotencyConflictError)
			return withRequestId(Response.json({ error: error.code }, { status: 409 }), requestId)
		const status = Number((error as Error & { status?: number }).status ?? 500)
		return withRequestId(
			Response.json(
				{ error: error instanceof Error ? error.message : "case_approval_rejection_failed" },
				{ status }
			),
			requestId
		)
	}
}
