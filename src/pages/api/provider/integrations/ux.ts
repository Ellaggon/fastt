import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import {
	isIntegrationUxEventName,
	recordProviderIntegrationUxEvent,
} from "@/lib/provider-integration-ux"

export const POST: APIRoute = async ({ request }) => {
	try {
		const auth = await requireProvider(request)
		const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
		if (!body || !isIntegrationUxEventName(body.event)) {
			return Response.json({ error: "INVALID_INTEGRATION_UX_EVENT" }, { status: 400 })
		}
		const result = await recordProviderIntegrationUxEvent({
			event: body.event,
			providerId: auth.providerId,
			actorUserId: auth.user.id,
			journeyId: typeof body.journeyId === "string" ? body.journeyId : null,
			connectorKey: typeof body.connectorKey === "string" ? body.connectorKey : null,
			step: typeof body.step === "string" ? body.step : null,
			durationMs: typeof body.durationMs === "number" ? body.durationMs : null,
			pendingMappings: typeof body.pendingMappings === "number" ? body.pendingMappings : null,
			totalMappings: typeof body.totalMappings === "number" ? body.totalMappings : null,
			errorCode: typeof body.errorCode === "string" ? body.errorCode : null,
			surface: typeof body.surface === "string" ? body.surface : null,
		})
		if (!result.ok) return Response.json({ error: result.error }, { status: 400 })
		return new Response(null, {
			status: 204,
			headers: { "Cache-Control": "no-store" },
		})
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json({ error: "INTEGRATION_UX_EVENT_FAILED" }, { status: 500 })
	}
}
