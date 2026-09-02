import { describe, expect, it, vi } from "vitest"

import { searchFinancialBookingCandidates } from "@/modules/financial/application/use-cases/search-financial-booking-candidates"
import type { FinancialBookingCandidateRepositoryPort } from "@/modules/financial/application/ports/FinancialBookingCandidateRepositoryPort"

describe("searchFinancialBookingCandidates", () => {
	it("normalizes the query and bounds the result size before querying", async () => {
		const repository: FinancialBookingCandidateRepositoryPort = {
			search: vi.fn(async () => []),
		}
		await searchFinancialBookingCandidates(
			{ repository },
			{ providerId: " provider_1 ", query: "  Ana   Pérez  ", limit: 999 }
		)
		expect(repository.search).toHaveBeenCalledWith({
			providerId: "provider_1",
			query: "Ana Pérez",
			limit: 20,
		})
	})

	it("rejects ambiguous one-character queries before querying", async () => {
		const repository: FinancialBookingCandidateRepositoryPort = { search: vi.fn() }
		await expect(
			searchFinancialBookingCandidates(
				{ repository },
				{ providerId: "provider_1", query: "a", limit: 10 }
			)
		).rejects.toThrow("FINANCIAL_BOOKING_SEARCH_QUERY_TOO_SHORT")
		expect(repository.search).not.toHaveBeenCalled()
	})

	it("rejects unbounded search input before querying", async () => {
		const repository: FinancialBookingCandidateRepositoryPort = { search: vi.fn() }
		await expect(
			searchFinancialBookingCandidates(
				{ repository },
				{ providerId: "provider_1", query: "x".repeat(121) }
			)
		).rejects.toThrow("FINANCIAL_BOOKING_SEARCH_QUERY_TOO_LONG")
		expect(repository.search).not.toHaveBeenCalled()
	})
})
