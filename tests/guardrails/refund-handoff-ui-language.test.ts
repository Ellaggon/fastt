import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: refund handoff UI stays operational-review only", () => {
	it("uses handoff review language and blocks refund execution copy", () => {
		const ui = read("src/pages/financial/index.astro")
		const required = [
			"Refund handoff",
			"Handoff acknowledged",
			"Waiting external review",
			"Refund evidence visible",
			"Review closed",
		]
		const forbidden = [
			/refund processed/i,
			/refund completed/i,
			/refund sent/i,
			/money returned/i,
			/execute refund/i,
			/retry refund/i,
			/payout sent/i,
		]
		const violations = [
			...required.flatMap((signal) =>
				ui.includes(signal) ? [] : [`Refund handoff UI missing ${signal}`]
			),
			...forbidden.flatMap((pattern) =>
				pattern.test(ui) ? [`Refund handoff UI contains execution copy ${pattern}`] : []
			),
		]
		expect(violations).toEqual([])
	})
})
