import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial references remain provider scoped", () => {
	it("requires provider auth, booking ownership validation and provider-filtered reads", () => {
		const route = read("src/pages/api/internal/financial/references.ts")
		const repository = read(
			"src/modules/financial/infrastructure/repositories/FinancialReferenceRepository.ts"
		)
		const required = [
			"requireFinancialProvider(request)",
			"bookingBelongsToProvider(bookingId, auth.providerId)",
			"findByProvider",
			"providerId: auth.providerId",
			"FinancialReferenceTable.providerId",
		]
		const forbidden = [/Payment/, /ProviderPayout/, /ProviderPayoutBooking/]
		const violations = [
			...required.flatMap((signal) =>
				route.includes(signal) || repository.includes(signal)
					? []
					: [`Missing provider scope signal: ${signal}`]
			),
			...forbidden.flatMap((pattern) =>
				pattern.test(route) || pattern.test(repository)
					? [`Financial references must not use legacy finance table ${pattern}`]
					: []
			),
		]
		expect(violations).toEqual([])
	})
})
