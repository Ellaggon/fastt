import { describe, expect, it } from "vitest"

import { financialSourceWithoutTests, read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: refund handoff remains visibility only", () => {
	it("models handoff status without refund execution", () => {
		const domain = read("src/modules/financial/domain/refund-handoff-record.ts")
		const source = financialSourceWithoutTests()
		const required = [
			"required",
			"acknowledged",
			"waiting_external",
			"evidence_recorded",
			"closed",
			"dismissed",
		]
		const violations = [
			...required.flatMap((signal) =>
				domain.includes(signal) ? [] : [`refund handoff missing ${signal}`]
			),
			...[/executeRefund/, /processRefund/, /refundNow/, /RefundProvider/].flatMap((pattern) =>
				pattern.test(source) ? [`Refund handoff drifted into execution ${pattern}`] : []
			),
			...[
				/retryRefund/,
				/refundCompleted/,
				/refundProcessed/,
				/refundSucceeded/,
				/payoutSent/,
				/moneyReturned/,
			].flatMap((pattern) =>
				pattern.test(source)
					? [`Refund handoff contains forbidden execution wording ${pattern}`]
					: []
			),
		]
		expect(violations).toEqual([])
	})
})
