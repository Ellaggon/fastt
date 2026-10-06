import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

function read(relativePath: string) {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("Guardrail: financial reads filter by workspace scope on the server", () => {
	it("wires scope resolution into paginated financial BFF endpoints", () => {
		const endpoints = [
			"src/pages/api/internal/financial/operations.ts",
			"src/pages/api/internal/financial/provider-finance.ts",
			"src/pages/api/internal/financial/reconciliation-queue.ts",
			"src/pages/api/internal/financial/refund-handoffs.ts",
			"src/pages/api/internal/financial/exceptions.ts",
			"src/pages/api/internal/financial/provider-summary.ts",
			"src/pages/api/internal/financial/references.ts",
			"src/pages/api/internal/financial/review-events.ts",
			"src/pages/api/internal/financial/booking-candidates.ts",
		]
		const violations = endpoints.flatMap((file) => {
			const source = read(file)
			const issues: string[] = []
			if (!source.includes("resolveFinancialApiProductScope"))
				issues.push(`${file}: missing resolveFinancialApiProductScope`)
			if (!source.includes("scopeResult.productFilter"))
				issues.push(`${file}: scope resolved but productFilter not applied`)
			return issues
		})
		expect(violations).toEqual([])
	})

	it("applies the product filter inside every read repository the scoped endpoints use", () => {
		const repositories = [
			"src/modules/financial/infrastructure/repositories/FinancialExceptionRepository.ts",
			"src/modules/financial/infrastructure/repositories/RefundHandoffRepository.ts",
			"src/modules/financial/infrastructure/repositories/FinancialReferenceRepository.ts",
			"src/modules/financial/infrastructure/repositories/FinancialReviewEventRepository.ts",
		]
		for (const file of repositories) {
			expect(read(file), file).toContain("bookingIdMatchesProductFilter(")
		}
		expect(
			read("src/modules/financial/infrastructure/repositories/FinancialBookingCandidateRepository.ts")
		).toContain("bookingMatchesProductFilterPredicate(")
		const summary = read("src/lib/financial/financialProviderSummary.ts")
		expect(summary).toContain("productFilter?: FinancialApiProductFilter")
		expect(summary).toContain("financialProviderSummaryScoped(")
	})

	it("declares unattributable evidence instead of mixing it into scoped reconciliation cases", () => {
		const source = read("src/pages/api/internal/financial/reconciliation-queue.ts")
		expect(source).toContain("scopeApplied: false")
		expect(source).toMatch(/reconciliationMatchRepository\.findByProvider\(\{\s*providerId: auth\.providerId,\s*bookingIds,/)
	})
})
