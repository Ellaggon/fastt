import type { APIRoute } from "astro"

import { buildPricingV2ShadowReport } from "@/lib/observability/pricing-v2-shadow-report"

export const GET: APIRoute = async () => {
	const report = buildPricingV2ShadowReport()
	const goNoGo =
		report.global.totalEvaluated === 0
			? "NO_GO"
			: report.global.missingRatio < 0.01 && report.global.mismatchRatio < 0.03
				? "GO"
				: "NO_GO"

	return new Response(
		JSON.stringify({
			reportedAt: new Date().toISOString(),
			decision: goNoGo,
			global: report.global,
			topMismatches: report.topMismatches,
			coverageByOccupancyKey: report.byOccupancyKey,
			breakdownByRatePlan: report.byRatePlanId,
			mismatchCauses: report.mismatchCauses,
			thresholds: {
				go: {
					missingRatioLt: 0.01,
					mismatchRatioLt: 0.03,
				},
			},
		}),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		}
	)
}
