import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const operationsRoute = "src/pages/api/internal/financial/operations.ts"
const exceptionsRoute = "src/pages/api/internal/financial/exceptions.ts"
const operationBuilder =
	"src/modules/financial/application/use-cases/build-financial-operation-review.ts"
const overlayBuilder =
	"src/modules/financial/application/use-cases/build-financial-review-overlay.ts"
const page = "src/pages/financial/index.astro"

describe("Guardrail: financial Stage 2 derivation converges on pure helpers", () => {
	it("keeps operations route as read orchestration and derivation in a pure builder", () => {
		const route = read(operationsRoute)
		const builder = read(operationBuilder)
		const violations = [
			route.includes("buildFinancialOperationReview")
				? null
				: `${operationsRoute}: must delegate operational review derivation to pure builder`,
			route.includes("function deriveFinancialEvidenceVisibility")
				? `${operationsRoute}: must not re-own evidence derivation locally`
				: null,
			route.includes("function deriveFinancialReconciliationState")
				? `${operationsRoute}: must not re-own evidence alignment derivation locally`
				: null,
			builder.includes("detectFinancialExceptions")
				? null
				: `${operationBuilder}: must centralize detect-financial-exceptions in the pipeline`,
			builder.includes("deriveFinancialEvidenceAlignmentState")
				? null
				: `${operationBuilder}: must use evidence alignment semantics, not reconciliation finality`,
			builder.includes("db.") || builder.includes("astro:db")
				? `${operationBuilder}: pure derivation helper must not read or write db`
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps overlay semantics reusable and explicit", () => {
		const route = read(exceptionsRoute)
		const builder = read(overlayBuilder)
		const violations = [
			route.includes("buildFinancialReviewOverlay")
				? null
				: `${exceptionsRoute}: must use shared overlay helper`,
			builder.includes("FINANCIAL_REVIEW_OVERLAY_SOURCES")
				? null
				: `${overlayBuilder}: must expose explicit overlay source semantics`,
			builder.includes("isActiveFinancialExceptionStatus")
				? null
				: `${overlayBuilder}: terminal persisted records must rely on domain lifecycle semantics`,
			builder.includes("autoBackfill") || builder.includes("autoReopen")
				? `${overlayBuilder}: pure overlay helper must not imply sync/backfill behavior`
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps UI operational wording aligned with review/evidence semantics", () => {
		const source = read(page)
		const required = [
			"Review queue",
			"Review detail",
			"reference recorded",
			"evidence visible",
			"derived only",
			"derived still present",
			"Review closed",
			"Resolved means operational review closed",
		]
		const violations = required.flatMap((signal) =>
			source.includes(signal) ? [] : [`${page}: missing operational wording ${signal}`]
		)
		expect(violations).toEqual([])
	})
})
