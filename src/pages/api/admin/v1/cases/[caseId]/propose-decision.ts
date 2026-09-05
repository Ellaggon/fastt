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
	applyCaseDecision,
	evidenceDecisionSnapshot,
	getCaseEvidence,
	getCaseWorkspace,
	proposeCaseDecision,
} from "@/modules/casework/public"

async function payload(request: Request) {
	const type = request.headers.get("content-type") ?? ""
	if (type.includes("application/json")) return (await request.json()) as Record<string, unknown>
	return Object.fromEntries(await request.formData())
}

export const POST: APIRoute = async ({ request, params, redirect }) => {
	const requestId = requestIdFromRequest(request)
	try {
		if (!getFeatureFlag("COMMAND_CENTER_V2_COMMANDS_ENABLED", { request }))
			return withRequestId(
				Response.json({ error: "casework_commands_disabled" }, { status: 503 }),
				requestId
			)
		const body = await payload(request)
		const caseId = String(params.caseId ?? "")
		const input = {
			caseId,
			expectedVersion: Number(body.caseVersion),
			decision: String(body.decision ?? ""),
			reasonCode: String(body.reasonCode ?? ""),
			comment: String(body.comment ?? "").trim() || null,
			evidenceRevision: String(body.evidenceRevision ?? ""),
		}
		if (!caseId || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
			return Response.json({ error: "invalid_case_command" }, { status: 400 })
		const audit: SensitiveCommandAudit = {
			requestId,
			action: "case.decision.propose",
			entityType: "ComplianceCase",
			entityId: caseId,
			riskLevel: "high",
		}
		const command = await executeSensitiveCommand({
			audit,
			idempotency: {
				scope: "case.decision.propose",
				key: idempotencyKeyFromRequest(request),
				payload: input,
			},
			authorize: async () => {
				const principal = await requireInternalPermission(request, "case.decision.propose")
				const workspace = await getCaseWorkspace(caseId)
				if (!workspace) throw Object.assign(new Error("case_not_found"), { status: 404 })
				const permission = {
					verification: "provider.verification.review",
					fiscal: "provider.fiscal.review",
					documents: "provider.document.review",
					payments: "provider.payment.review",
				}[workspace.case.domain] as
					| "provider.verification.review"
					| "provider.fiscal.review"
					| "provider.document.review"
					| "provider.payment.review"
				await requireInternalPermission(request, permission, {
					type: "provider",
					id: workspace.case.providerId,
				})
				audit.actorUserId = principal.user.id
				audit.providerId = workspace.case.providerId
				audit.actorRoleKeys = principal.roles
				await requireRecentInternalAuthentication({ request, user: principal.user })
			},
			execute: async () => {
				if (!audit.actorUserId) throw new Error("sensitive_command_actor_missing")
				const workspace = await getCaseWorkspace(caseId)
				if (!workspace) throw Object.assign(new Error("case_not_found"), { status: 404 })
				const evidence = await getCaseEvidence(workspace)
				if (!input.evidenceRevision || evidence.revision !== input.evidenceRevision)
					throw Object.assign(new Error("case_evidence_changed"), { status: 409 })
				if (input.decision === "approved" && evidence.approvalBlockers.length)
					throw Object.assign(new Error("approval_evidence_incomplete"), { status: 422 })
				if (
					input.decision === "approved" &&
					evidence.approvalWarnings.length &&
					!input.comment?.trim()
				)
					throw Object.assign(new Error("approval_evidence_review_comment_required"), {
						status: 422,
					})
				const proposed = await proposeCaseDecision({
					caseId: input.caseId,
					expectedVersion: input.expectedVersion,
					decision: input.decision,
					reasonCode: input.reasonCode,
					comment: input.comment,
					actorUserId: audit.actorUserId,
					evidenceSnapshot: evidenceDecisionSnapshot(evidence),
				})
				const application = proposed.requiresSecondControl
					? { applied: false, caseVersion: proposed.caseVersion, pendingSecondControl: true }
					: await applyCaseDecision({
							decisionId: proposed.decisionId,
							expectedCaseVersion: proposed.caseVersion,
							actorUserId: audit.actorUserId,
						})
				const result = { ...proposed, ...application }
				return {
					response: result,
					afterJson: { ...result, decision: input.decision, reasonCode: input.reasonCode },
				}
			},
		})
		if (!request.headers.get("content-type")?.includes("application/json"))
			return redirect(`/admin/cases/${encodeURIComponent(caseId)}?notice=decision_proposed`, 303)
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
				{ error: error instanceof Error ? error.message : "case_command_failed" },
				{ status }
			),
			requestId
		)
	}
}
