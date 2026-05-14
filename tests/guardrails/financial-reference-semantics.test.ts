import { describe, expect, it } from "vitest"

import { financialSourceWithoutTests, read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial references are evidence only", () => {
	it("requires evidence/reference naming and blocks fake execution semantics", () => {
		const source = financialSourceWithoutTests()
		const referenceDomain = read("src/modules/financial/domain/financial-reference.ts")
		const required = [
			"payment_evidence",
			"refund_evidence",
			"settlement_evidence",
			"invoice_reference",
		]
		const forbidden = [
			/capturePayment/,
			/executeRefund/,
			/processRefund/,
			/settlePayout/,
			/sendPayout/,
			/issueInvoice/,
			/createLedgerEntry/,
			/retryPayment/,
			/paymentCompleted/,
			/refundProcessed/,
			/settlementExecuted/,
			/payoutSent/,
			/captureSucceeded/,
			/invoiceIssued/,
			/journalEntry/,
		]
		const violations = [
			...required.flatMap((signal) =>
				referenceDomain.includes(signal) ? [] : [`financial-reference.ts missing ${signal}`]
			),
			...forbidden.flatMap((pattern) =>
				pattern.test(source) ? [`Financial source contains fake execution wording ${pattern}`] : []
			),
		]
		expect(violations).toEqual([])
	})
})
