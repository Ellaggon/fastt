import type { FinancialApiProductFilter } from "@/lib/financial/financialApiProductScope"

import type { FinancialBookingCandidateRepositoryPort } from "../ports/FinancialBookingCandidateRepositoryPort"

export async function searchFinancialBookingCandidates(
	deps: { repository: FinancialBookingCandidateRepositoryPort },
	input: {
		providerId: string
		query?: string | null
		limit?: number | null
		productFilter?: FinancialApiProductFilter
	}
) {
	const providerId = String(input.providerId || "").trim()
	const query = String(input.query || "")
		.trim()
		.replace(/\s+/g, " ")
	const requestedLimit = Number(input.limit ?? 10)
	const limit = Number.isFinite(requestedLimit)
		? Math.max(1, Math.min(Math.floor(requestedLimit), 20))
		: 10
	if (!providerId) throw new Error("FINANCIAL_BOOKING_SEARCH_PROVIDER_REQUIRED")
	if (query.length === 1) throw new Error("FINANCIAL_BOOKING_SEARCH_QUERY_TOO_SHORT")
	if (query.length > 120) throw new Error("FINANCIAL_BOOKING_SEARCH_QUERY_TOO_LONG")

	if (
		input.productFilter !== undefined &&
		input.productFilter !== null &&
		input.productFilter.length === 0
	) {
		return []
	}
	return deps.repository.search({
		providerId,
		query,
		limit,
		productFilter: input.productFilter ?? null,
	})
}
