import { describe, expect, it } from "vitest"

import { financialSourceWithoutTests, read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: resolved review does not mean reconciled", () => {
	it("does not persist reconciled as a Stage 2 exception status", () => {
		const domain = read("src/modules/financial/domain/financial-exception-record.ts")
		const source = financialSourceWithoutTests()
		const refundDomain = read("src/modules/financial/domain/refund-handoff-record.ts")
		const page = read("src/pages/financial/index.astro")
		const violations = [
			domain.includes("reconciled") ? "FinancialExceptionRecord cannot include reconciled" : null,
			source.includes("operational_review_closed_only")
				? null
				: "Financial source must preserve operational_review_closed_only semantics",
			refundDomain.includes("closed") && page.includes("Review closed")
				? null
				: "Refund handoff closed must be presented as review closed",
			/refund (executed|processed|completed|sent)/i.test(source)
				? "Refund handoff closure must not imply refund execution"
				: null,
			/payment settled/i.test(source) || /settlement executed/i.test(source)
				? "Evidence recorded must not imply payment settlement"
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})
})
