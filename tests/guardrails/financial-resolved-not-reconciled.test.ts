import { describe, expect, it } from "vitest"

import { financialSourceWithoutTests, read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: resolved review does not mean reconciled", () => {
	it("does not persist reconciled as a Stage 2 exception status", () => {
		const domain = read("src/modules/financial/domain/financial-exception-record.ts")
		const source = financialSourceWithoutTests()
		const violations = [
			domain.includes("reconciled") ? "FinancialExceptionRecord cannot include reconciled" : null,
			source.includes("resolved_not_reconciled")
				? null
				: "Financial source must preserve resolved_not_reconciled semantics",
		].filter(Boolean)
		expect(violations).toEqual([])
	})
})
