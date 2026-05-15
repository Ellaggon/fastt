import { describe, expect, it } from "vitest"

import {
	financialSourceFiles,
	financialSourceWithoutTests,
	read,
} from "./financial-stage2-guardrail-utils"

const financialReferenceDomain = "src/modules/financial/domain/financial-reference.ts"
const reviewEventDomain = "src/modules/financial/domain/financial-review-event.ts"
const shadowDomains = [
	"src/modules/financial/domain/payment-intent.ts",
	"src/modules/financial/domain/settlement-record.ts",
	"src/modules/financial/domain/refund-record.ts",
]
const operationBuilder =
	"src/modules/financial/application/use-cases/build-financial-operation-review.ts"
const reconciliationRoute = "src/pages/api/internal/financial/reconciliation.ts"
const financialPage = "src/pages/financial/index.astro"

describe("Guardrail: Stage 3 readiness semantic freeze", () => {
	it("keeps FinancialReference evidence-only and out of transaction lifecycle semantics", () => {
		const domain = read(financialReferenceDomain)
		const source = financialSourceWithoutTests()
		const forbidden = [
			/FinancialReference[^\n]+transaction/i,
			/transactionStatus/i,
			/paymentCompleted/,
			/refundProcessed/,
			/settlementExecuted/,
			/captureSucceeded/,
			/authorizationSucceeded/,
		]
		const violations = [
			domain.includes("evidence/reference visibility only")
				? null
				: `${financialReferenceDomain}: must document evidence/reference-only semantics`,
			domain.includes("not a payment transaction")
				? null
				: `${financialReferenceDomain}: must explicitly reject transaction source-of-truth semantics`,
			...forbidden.flatMap((pattern) =>
				pattern.test(source) ? [`Financial source violates evidence-only freeze ${pattern}`] : []
			),
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps FinancialReviewEvent as audit trail, not event sourcing", () => {
		const domain = read(reviewEventDomain)
		const source = financialSourceWithoutTests()
		const forbidden = [
			/replayFinancialEvents/,
			/rebuildState/,
			/rebuildFinancialState/,
			/reconstructFinancialState/,
			/hydrateFromEvents/,
			/eventSourcing/i,
		]
		const violations = [
			domain.includes("operational audit trail only")
				? null
				: `${reviewEventDomain}: must document audit-trail-only semantics`,
			domain.includes("must not be used to rebuild financial state")
				? null
				: `${reviewEventDomain}: must reject state reconstruction`,
			...forbidden.flatMap((pattern) =>
				pattern.test(source) ? [`Financial review event drift ${pattern}`] : []
			),
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("freezes legacy shadow models so they cannot become PSP lifecycle foundations", () => {
		const violations = shadowDomains.flatMap((file) => {
			const source = read(file)
			return [
				source.includes("Stage 2 shadow compatibility only")
					? null
					: `${file}: must document shadow compatibility only`,
				source.includes("NOT") || source.includes("not ")
					? null
					: `${file}: must reject execution/source-of-truth semantics`,
				/"completed"|"captured"|"settled"|"refunded"/.test(source)
					? `${file}: shadow status cannot imply financial finality`
					: null,
			].filter(Boolean)
		})
		expect(violations).toEqual([])
	})

	it("keeps derived evidence alignment out of reconciliation finality naming", () => {
		const builder = read(operationBuilder)
		const page = read(financialPage)
		const violations = [
			builder.includes("FinancialEvidenceAlignmentState")
				? null
				: `${operationBuilder}: must expose evidence alignment state`,
			builder.includes("evidence_matched") && builder.includes("evidence_partial")
				? null
				: `${operationBuilder}: must use observational evidence alignment states`,
			/partially_reconciled|\breconciled\b|reconciliation_state/.test(builder)
				? `${operationBuilder}: derived visibility must not use reconciliation finality naming`
				: null,
			/Partially reconciled|\bReconciled\b|financially reconciled/i.test(page)
				? `${financialPage}: UI must not imply financial reconciliation finality`
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps the reconciliation endpoint read-only and converged on the operation review builder", () => {
		const route = read(reconciliationRoute)
		const violations = [
			route.includes("buildFinancialOperationReview")
				? null
				: `${reconciliationRoute}: must use centralized financial operation review builder`,
			route.includes("BookingRoomDetail.totalPrice") && route.includes(".all()")
				? null
				: `${reconciliationRoute}: must read all room snapshot rows for multi-room safety`,
			/\.insert\(|\.update\(|\.delete\(|autoResolve|autoClose/.test(route)
				? `${reconciliationRoute}: read-only evidence comparison cannot write or auto-transition`
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("blocks Stage 3 premature execution/accounting language across financial sources", () => {
		const source = financialSourceFiles.map((file) => `// ${file}\n${read(file)}`).join("\n")
		const forbidden = [
			/capturePayment/,
			/executeRefund/,
			/processRefund/,
			/retryPayment/,
			/settlePayout/,
			/sendPayout/,
			/issueInvoice/,
			/createLedgerEntry/,
			/accountingExport/,
			/paymentCompleted/,
			/payoutSent/,
			/settlementExecuted/,
		]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(source)
				? [`Financial source contains premature Stage 3 execution language ${pattern}`]
				: []
		)
		expect(violations).toEqual([])
	})
})
