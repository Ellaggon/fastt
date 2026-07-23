import type { APIRoute } from "astro"

import { getFinancialProviderSummary } from "@/lib/financial/financialProviderSummary"

import { requireFinancialProvider } from "./_stage2"

export const GET: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const summary = await getFinancialProviderSummary({ providerId: auth.providerId })
	return new Response(JSON.stringify(summary), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "private, max-age=30",
			"X-Fastt-Cache": summary.freshness.cacheState,
		},
	})
}
