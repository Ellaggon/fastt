import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { formatHistoryDate, loadRatesContextualHistory } from "@/lib/audit/contextualHistory"
import { logRoutePerformance } from "@/lib/observability/performanceLog"
import { createServerTimingRecorder } from "@/lib/observability/serverTiming"
import { buildProviderRatePlansSurface } from "@/lib/rates/providerRatePlansSurface"
import { resolvePolicyDateRange } from "@/modules/policies/public"

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const timing = createServerTimingRecorder()
	let userId: string | null = null
	let providerId: string | null = null
	const response = (payload: unknown, status: number) => {
		timing.addTotal("total")
		logRoutePerformance({
			name: "provider-rate-plans-history",
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
			headers: timing.headers({
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			}),
		})
	}

	const auth = await timing.time("authProvider", () => requireProvider(request).catch(() => null))
	if (!auth) {
		return response({ error: "Unauthorized" }, 401)
	}
	userId = auth.user.id
	providerId = auth.providerId

	const { checkIn, checkOut } = resolvePolicyDateRange(url)
	const surface = await buildProviderRatePlansSurface({
		providerId: auth.providerId,
		checkIn,
		checkOut,
		timing,
	})
	const history = await timing.time("history", () =>
		loadRatesContextualHistory({
			providerId: auth.providerId,
			ratePlans: surface.ratePlans,
			limit: 8,
			context: "rate_plans",
		})
	)

	return response(
		{
			history: history.map((item) => ({
				id: item.id,
				title: item.title,
				description: item.description,
				createdAt: item.createdAt,
				createdAtLabel: formatHistoryDate(item.createdAt),
			})),
		},
		200
	)
}
