import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial UI remains queue-first", () => {
	it("blocks dashboard and fake payment actions", () => {
		const source = read("src/pages/financial/index.astro")
		const forbidden = [
			/command center/i,
			/AI insights/i,
			/revenue chart/i,
			/capture payment/i,
			/retry payment/i,
			/refund now/i,
			/settle payout/i,
			/issue invoice/i,
		]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(source) ? [`Financial UI contains theater/action ${pattern}`] : []
		)
		expect(violations).toEqual([])
	})
})
