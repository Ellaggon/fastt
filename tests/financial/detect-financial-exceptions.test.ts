import { describe, expect, it } from "vitest"

import { detectFinancialExceptions } from "@/modules/financial/application/use-cases/detect-financial-exceptions"

describe("detectFinancialExceptions", () => {
	const base = {
		bookingId: "b1",
		providerId: "p1",
		evidenceAlignmentState: "aligned",
		financialEvidence: {},
		paymentIntentCount: 0,
		settlementRecordCount: 0,
		hasPaymentReference: true,
		hasSettlementReference: true,
		hasRefundReference: true,
		hasLineItemSnapshots: true,
		hasTaxFeeSnapshots: true,
		taxesTotal: 0,
		lineItemAllocationCount: 1,
		snapshotVersion: "v1",
	}

	it("uses neutral contract snapshot copy", () => {
		const incomplete = detectFinancialExceptions({
			...base,
			hasLineItemSnapshots: false,
		}).find((entry) => entry.code === "incomplete_contract_snapshot")
		expect(incomplete?.reason).toMatch(/line item/i)
		expect(incomplete?.reason).not.toMatch(/room/i)
	})

	it("emits multi_line_review instead of lodging-specific codes", () => {
		const multi = detectFinancialExceptions({
			...base,
			lineItemAllocationCount: 2,
		}).find((entry) => entry.code === "multi_line_review")
		expect(multi?.reason).toMatch(/line/i)
		expect(multi?.reason).not.toMatch(/room/i)
	})
})
