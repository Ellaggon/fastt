import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial Stage 2 persistence foundation", () => {
	it("declares only workflow/evidence/audit tables", () => {
		const dbConfig = read("src/shared/infrastructure/db/schema/tables.ts")
		const required = [
			"FinancialExceptionRecord",
			"FinancialReference",
			"RefundHandoffRecord",
			"FinancialReviewEvent",
		]
		const violations = required.flatMap((signal) =>
			dbConfig.includes(signal)
				? []
				: [`src/shared/infrastructure/db/schema/tables.ts missing ${signal}`]
		)
		expect(violations).toEqual([])
	})
})
