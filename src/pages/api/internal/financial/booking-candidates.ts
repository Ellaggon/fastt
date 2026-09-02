import type { APIRoute } from "astro"

import { financialBookingCandidateRepository } from "@/container/financial.container"
import { searchFinancialBookingCandidates } from "@/modules/financial/public"

import { json, requireFinancialManager } from "./_stage2"

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialManager(request)
	if (!auth.ok) return auth.response
	try {
		const items = await searchFinancialBookingCandidates(
			{ repository: financialBookingCandidateRepository },
			{
				providerId: auth.providerId,
				query: url.searchParams.get("q"),
				limit: Number(url.searchParams.get("limit") ?? 10),
			}
		)
		const response = json({ items })
		response.headers.set("Cache-Control", "private, no-store")
		return response
	} catch (error) {
		const message = error instanceof Error ? error.message : "FINANCIAL_BOOKING_SEARCH_FAILED"
		if (message.includes("QUERY_TOO_SHORT") || message.includes("QUERY_TOO_LONG")) {
			return json({ error: message }, 400)
		}
		console.error("financial.booking_candidate_search.failed", {
			providerId: auth.providerId,
			error: message,
		})
		return json({ error: "FINANCIAL_BOOKING_SEARCH_FAILED" }, 500)
	}
}
