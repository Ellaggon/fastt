import type { APIRoute } from "astro"
import { getFeatureFlag, isCommandCenterV2PilotProvider } from "@/config/featureFlags"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
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
	informationRequestContext,
	publishInformationRequest,
	reviewPermissionByDomain,
} from "@/modules/casework/public"

export const POST: APIRoute = async ({ request, params }) => {
	const requestId = requestIdFromRequest(request)
	try {
		if (!getFeatureFlag("COMMAND_CENTER_V2_COMMANDS_ENABLED", { request }))
			return Response.json({ error: "casework_commands_disabled" }, { status: 503 })
		const body = await request.json()
		const decisionId = String(params.decisionId ?? "")
		const input = {
			decisionId,
			expectedVersion: Number(body.caseVersion),
			message: String(body.message ?? ""),
		}
		if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
			return Response.json({ error: "invalid_case_command" }, { status: 400 })
		const audit: SensitiveCommandAudit = {
			requestId,
			action: "case.information.publish",
			entityType: "CaseDecision",
			entityId: decisionId,
			riskLevel: "high",
		}
		const command = await executeSensitiveCommand({
			atomic: true,
			audit,
			idempotency: { scope: audit.action, key: idempotencyKeyFromRequest(request), payload: input },
			authorize: async () => {
				await requireInternalPermission(request, "case.decision.propose")
				const context = await informationRequestContext(decisionId)
				if (!isCommandCenterV2PilotProvider(context.case.providerId))
					throw Object.assign(new Error("casework_pilot_scope_required"), { status: 403 })
				const principal = await requireInternalPermission(request, "case.decision.propose", {
					type: "provider",
					id: context.case.providerId,
				})
				const permission =
					reviewPermissionByDomain[context.case.domain as keyof typeof reviewPermissionByDomain]
				if (!permission)
					throw Object.assign(new Error("information_request_forbidden"), { status: 403 })
				await requireInternalPermission(request, permission, {
					type: "provider",
					id: context.case.providerId,
				})
				audit.actorUserId = principal.user.id
				audit.providerId = context.case.providerId
				audit.actorRoleKeys = principal.roles
				await requireRecentInternalAuthentication({ request, user: principal.user })
			},
			execute: async () => {
				const result = await publishInformationRequest({
					...input,
					actorUserId: audit.actorUserId!,
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
		return withRequestId(
			Response.json(
				{ error: error instanceof Error ? error.message : "information_request_failed" },
				{
					status:
						error instanceof IdempotencyConflictError
							? 409
							: Number((error as { status?: number }).status ?? 500),
				}
			),
			requestId
		)
	}
}
