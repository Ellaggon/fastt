import type { APIRoute } from "astro"
import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import { createServerTimingRecorder } from "@/lib/observability/serverTiming"
import { logRoutePerformance } from "@/lib/observability/performanceLog"
import { buildProviderSettingsSummary } from "@/lib/provider-settings-summary"

function json(payload: unknown, status = 200, headers?: HeadersInit) {
	const responseHeaders = new Headers(headers)
	responseHeaders.set("Content-Type", "application/json")
	return new Response(JSON.stringify(payload), {
		status,
		headers: responseHeaders,
	})
}

export const GET: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
	const timing = createServerTimingRecorder()
	let userIdForLog: string | null = null
	let providerIdForLog: string | null = null
	const jsonWithTiming = (payload: unknown, status = 200) => {
		timing.addTotal("settingsSummary")
		logRoutePerformance({
			name: "provider-settings-summary",
			request,
			status,
			startedAt,
			timing,
			userId: userIdForLog,
			providerId: providerIdForLog,
		})
		return json(payload, status, timing.headers())
	}

	const providerSession = await timing.time("authProvider", () =>
		getProviderSessionSurfaceFromRequest(request)
	)
	userIdForLog = providerSession?.userId ?? null
	providerIdForLog = providerSession?.providerId ?? null
	if (!providerSession?.userId) return jsonWithTiming({ error: "Unauthorized" }, 401)
	if (!providerSession.providerId) return jsonWithTiming({ error: "Provider not found" }, 404)

	const summary = await buildProviderSettingsSummary({
		providerId: providerSession.providerId,
		userId: providerSession.userId,
		timing,
	})
	if (!summary) return jsonWithTiming({ error: "Provider not found" }, 404)

	return jsonWithTiming(summary)
}
