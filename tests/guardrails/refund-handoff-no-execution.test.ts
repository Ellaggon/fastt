import { describe, expect, it } from "vitest"

import { financialSourceWithoutTests } from "./financial-stage2-guardrail-utils"

describe("Guardrail: refund handoffs do not execute refunds", () => {
	it("blocks PSP/refund/payout execution semantics in financial source", () => {
		const source = financialSourceWithoutTests()
		const forbidden = [
			/executeRefund/,
			/processRefund/,
			/retryRefund/,
			/refundCompleted/,
			/refundProcessed/,
			/refundSucceeded/,
			/payoutSent/,
			/moneyReturned/,
		]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(source) ? [`Refund handoff source contains execution semantic ${pattern}`] : []
		)
		expect(violations).toEqual([])
	})
})
