import type { APIRoute } from "astro"
import { IdempotencyConflictError } from "@/lib/commands/command-idempotency"
import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { getFeatureFlag, isCommandCenterV2PilotProvider } from "@/config/featureFlags"
import { executeSensitiveCommand } from "@/lib/commands/sensitive-command"
import { requestIdFromRequest } from "@/lib/http/request-context"
import {
	assertInformationRecipient,
	informationRequestContext,
	respondToInformationRequest,
} from "@/modules/casework/public"

export const POST: APIRoute = async ({ request }) => {
	try {
		if (
			request.headers.get("sec-fetch-site") === "cross-site" ||
			(request.headers.get("origin") &&
				request.headers.get("origin") !== new URL(request.url).origin)
		)
			return new Response("Origen no permitido", { status: 403 })
		const session = await requireProviderSessionSurface(request)
		const providerId = session.provider.providerId
		if (
			!getFeatureFlag("COMMAND_CENTER_V2_COMMANDS_ENABLED", { request }) ||
			!isCommandCenterV2PilotProvider(providerId)
		)
			return new Response("Respuestas fuera del piloto", { status: 403 })
		const form = await request.formData()
		const decisionId = String(form.get("decisionId") ?? "")
		const message = String(form.get("message") ?? "")
		const key = String(form.get("requestKey") ?? "")
		await executeSensitiveCommand({
			atomic: true,
			audit: {
				requestId: requestIdFromRequest(request),
				action: "case.information.respond",
				entityType: "CaseDecision",
				entityId: decisionId,
				providerId,
				actorUserId: session.user.id,
				riskLevel: "medium",
			},
			idempotency: {
				scope: "case.information.respond",
				key,
				payload: { decisionId, message, providerId },
			},
			authorize: async () => {
				const context = await informationRequestContext(decisionId)
				if (context.case.providerId !== providerId)
					throw new Response("Solicitud no encontrada", { status: 404 })
				await assertInformationRecipient(providerId, session.user.id, context.case.domain)
			},
			execute: async () => {
				const result = await respondToInformationRequest({
					decisionId,
					message,
					providerId,
					actorUserId: session.user.id,
				})
				return { response: result, afterJson: result }
			},
		})
		return Response.redirect(
			new URL("/provider/compliance/requests?result=received", request.url),
			303
		)
	} catch (error) {
		if (error instanceof Response) return error
		// Keep the page and its draft intact on recoverable errors; no false success redirect.
		return Response.json(
			{ error: error instanceof Error ? error.message : "information_response_failed" },
			{
				status:
					error instanceof IdempotencyConflictError
						? 409
						: Number((error as { status?: number }).status ?? 500),
			}
		)
	}
}
