import type { APIRoute } from "astro"

import { resolveFinancialApiProductScope } from "@/lib/financial/financialApiProductScope"
import { getFinancialProviderSummary } from "@/lib/financial/financialProviderSummary"

import { requireFinancialProvider } from "./_stage2"

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const scopeResult = await resolveFinancialApiProductScope(auth.providerId, url)
	if (!scopeResult.ok) return scopeResult.response
	const summary = await getFinancialProviderSummary({
		providerId: auth.providerId,
		productFilter: scopeResult.productFilter,
	})
	return new Response(JSON.stringify(summary), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "private, max-age=30",
			"X-Fastt-Cache": summary.freshness.cacheState,
		},
	})
}
