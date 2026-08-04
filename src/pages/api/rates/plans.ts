import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { logRoutePerformance } from "@/lib/observability/performanceLog"
import { createServerTimingRecorder } from "@/lib/observability/serverTiming"
import { loadProviderRatePlansReadModel } from "@/lib/rates/loadRatePlansReadModel"
import { resolvePolicyDateRange } from "@/modules/policies/public"

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const timing = createServerTimingRecorder()
	let userId: string | null = null
	let providerId: string | null = null
	const response = (payload: unknown, status: number) => {
		timing.addTotal("total")
		logRoutePerformance({
			name: "provider-rate-plans-api",
			request,
			url,
			status,
			startedAt,
			timing,
			userId,
			providerId,
		})
		return new Response(JSON.stringify(payload), {
			status,
			headers: timing.headers({ "Content-Type": "application/json" }),
		})
	}

	const auth = await timing.time("authProvider", () => requireProvider(request).catch(() => null))
	if (!auth) {
		return response({ error: "Unauthorized" }, 401)
	}
	userId = auth.user.id
	providerId = auth.providerId

	const requestUrl = url ?? new URL(request.url || "http://localhost:4321/api/rates/plans")
	const { checkIn, checkOut } = resolvePolicyDateRange(requestUrl)
	const ratePlans = await loadProviderRatePlansReadModel({
		providerId: auth.providerId,
		checkIn,
		checkOut,
		timing,
	})

	return response({ ratePlans }, 200)
}
