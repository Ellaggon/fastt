import type { APIRoute } from "astro"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"

import { getFeatureFlag } from "@/config/featureFlags"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import {
	idempotencyKeyFromRequest,
	IdempotencyConflictError,
} from "@/lib/commands/command-idempotency"
import {
	executeSensitiveCommand,
	type SensitiveCommandAudit,
} from "@/lib/commands/sensitive-command"
import { requestIdFromRequest, withRequestId } from "@/lib/http/request-context"
import { assignCase, getCaseWorkspace } from "@/modules/casework/public"

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
		const expectedVersion = Number(body.caseVersion)
		const deadlineHours = body.deadlineHours === undefined ? undefined : Number(body.deadlineHours)
		const audit: SensitiveCommandAudit = {
			requestId,
			action: deadlineHours === undefined ? "case.assign" : "case.deadline.set",
			entityType: "ComplianceCase",
			entityId: caseId,
			riskLevel: "medium",
		}
		const command = await executeSensitiveCommand({
			audit,
			idempotency: {
				scope: "case.assign",
				key: idempotencyKeyFromRequest(request),
				payload: { caseId, expectedVersion, deadlineHours },
			},
			authorize: async () => {
				const principal = await requireInternalPermission(request, "case.assign")
				await requireRecentInternalAuthentication({ request, user: principal.user })
				const workspace = await getCaseWorkspace(caseId)
				if (!workspace) throw Object.assign(new Error("case_not_found"), { status: 404 })
				if (workspace.case.providerStatus === "archived")
					throw Response.json({ error: "case_provider_archived" }, { status: 409 })
				audit.actorUserId = principal.user.id
				audit.actorRoleKeys = principal.roles
				;(audit as SensitiveCommandAudit & { actorEmail?: string }).actorEmail =
					principal.user.email
			},
			execute: async () => {
				if (!audit.actorUserId) throw new Error("sensitive_command_actor_missing")
				const principal = await requireInternalPermission(request, "case.assign")
				const result = await assignCase({
					caseId,
					expectedVersion,
					assigneeUserId: principal.user.id,
					assigneeEmail: principal.user.email,
					actorUserId: principal.user.id,
					deadlineHours,
				})
				return {
					response: result,
					afterJson: {
						...(deadlineHours === undefined
							? { assigneeUserId: principal.user.id }
							: { deadlineHours }),
						...result,
					},
				}
			},
		})
		if (!request.headers.get("content-type")?.includes("application/json"))
			return redirect(
				`/admin/cases/${encodeURIComponent(caseId)}${deadlineHours === undefined ? "?notice=assigned" : ""}`,
				303
			)
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
				{ error: error instanceof Error ? error.message : "case_assignment_failed" },
				{ status }
			),
			requestId
		)
	}
}
