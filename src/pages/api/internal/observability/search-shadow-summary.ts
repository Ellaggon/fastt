import type { APIRoute } from "astro"

import { buildSearchShadowSummary } from "@/lib/observability/search-shadow-summary"

export const GET: APIRoute = async () => {
	const summary = buildSearchShadowSummary("searchOffers")
	// In single-engine mode, shadow execution may be disabled by flag/sampling.
	// A zero mismatch summary does not imply runtime correctness by itself; consult
	// /api/internal/observability/search-decision for operational health.
	return new Response(
		JSON.stringify({
			ok: true,
			...summary,
			mismatch_rate_global: summary.mismatchRateGlobal,
			mismatch_by_type: summary.mismatchByType,
			topRatePlanMismatches: summary.topRatePlanMismatches,
			topReasonCodeMismatches: summary.topReasonCodeMismatches,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
