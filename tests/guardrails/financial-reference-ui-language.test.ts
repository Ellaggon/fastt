import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial reference UI uses evidence language only", () => {
	it("keeps reference workflow evidence-only and blocks execution wording", () => {
		const ui = read("src/pages/financial/index.astro")
		const required = ["Record evidence", "Reference recorded", "Evidence visible"]
		const forbidden = [
			/Payment completed/i,
			/Refund processed/i,
			/Settlement executed/i,
			/Capture successful/i,
			/capture payment/i,
			/retry payment/i,
			/refund now/i,
			/settle payout/i,
			/issue invoice/i,
			/command center/i,
			/AI finance assistant/i,
		]
		const violations = [
			...required.flatMap((signal) =>
				ui.includes(signal) ? [] : [`Financial reference UI missing ${signal}`]
			),
			...forbidden.flatMap((pattern) =>
				pattern.test(ui) ? [`Financial reference UI contains execution wording ${pattern}`] : []
			),
		]
		expect(violations).toEqual([])
	})
})
