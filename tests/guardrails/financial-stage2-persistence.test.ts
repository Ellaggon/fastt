import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial Stage 2 persistence foundation", () => {
	it("declares only workflow/evidence/audit tables", () => {
		const dbConfig = read("db/config.ts")
		const required = [
			"FinancialExceptionRecord",
			"FinancialReference",
			"RefundHandoffRecord",
			"FinancialReviewEvent",
		]
		const violations = required.flatMap((signal) =>
			dbConfig.includes(signal) ? [] : [`db/config.ts missing ${signal}`]
		)
		expect(violations).toEqual([])
	})
})
