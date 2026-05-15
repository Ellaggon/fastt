import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: refund handoff closure is review closure", () => {
	it("models close/dismiss as operational review only, not refund movement", () => {
		const closeUseCase = read("src/modules/financial/application/use-cases/close-refund-handoff.ts")
		const dismissUseCase = read(
			"src/modules/financial/application/use-cases/dismiss-refund-handoff.ts"
		)
		const ui = read("src/pages/financial/index.astro")
		const source = `${closeUseCase}\n${dismissUseCase}\n${ui}`
		const required = [
			"refund_handoff_closed",
			"refund_handoff_dismissed",
			"operational_refund_review_only",
			"Review closed means operational refund review closed",
		]
		const forbidden = [/processed/i, /completed/i, /executed/i, /money moved/i, /money returned/i]
		const violations = [
			...required.flatMap((signal) =>
				source.includes(signal) ? [] : [`Refund handoff review closure missing ${signal}`]
			),
			...forbidden.flatMap((pattern) =>
				pattern.test(source) ? [`Refund handoff closure implies execution ${pattern}`] : []
			),
		]
		expect(violations).toEqual([])
	})
})
