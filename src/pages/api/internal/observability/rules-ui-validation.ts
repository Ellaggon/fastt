import type { APIRoute } from "astro"
import { z } from "zod"

import { getRulesUiDailySummary } from "@/lib/observability/rules-ui-validation"

const querySchema = z.object({
	day: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
})

export const GET: APIRoute = async ({ url }) => {
	const parsed = querySchema.safeParse({
		day: String(url.searchParams.get("day") ?? "").trim() || undefined,
	})
	if (!parsed.success) {
		return new Response(
			JSON.stringify({
				error: "validation_error",
				details: parsed.error.issues,
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } }
		)
	}

	const summary = getRulesUiDailySummary(parsed.data.day)
	return new Response(
		JSON.stringify({
			day: summary.day,
			totalRequests: summary.totalRequests,
			rulesEnabledPct: summary.rulesEnabledPct,
			fallbackPct: summary.fallbackPct,
			mismatchPct: summary.mismatchPct,
			topMismatchCategories: summary.topMismatchCategories,
			topAffectedHotels: summary.topAffectedHotels,
			topAffectedSuppliers: summary.topAffectedSuppliers,
			topAffectedRatePlans: summary.topAffectedRatePlans,
			rates: summary.byRates,
		}),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		}
	)
}
