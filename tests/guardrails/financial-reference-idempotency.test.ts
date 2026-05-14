import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial references are idempotent evidence records", () => {
	it("keys idempotency by provider, booking, type, reference value and external system", () => {
		const repository = read(
			"src/modules/financial/infrastructure/repositories/FinancialReferenceRepository.ts"
		)
		const route = read("src/pages/api/internal/financial/references.ts")
		const requiredSignals = [
			"providerId: input.providerId",
			"eq(FinancialReferenceTable.providerId, params.providerId)",
			"eq(FinancialReferenceTable.bookingId, params.bookingId)",
			"eq(FinancialReferenceTable.type, params.type)",
			"eq(FinancialReferenceTable.referenceValue, params.referenceValue)",
			"COALESCE",
			"externalSystem",
			"allowedTypes",
		]
		const violations = requiredSignals.flatMap((signal) =>
			repository.includes(signal) || route.includes(signal)
				? []
				: [`Missing idempotency signal: ${signal}`]
		)
		expect(violations).toEqual([])
	})
})
