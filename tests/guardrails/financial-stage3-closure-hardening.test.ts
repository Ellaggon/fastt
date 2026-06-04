import { describe, expect, it } from "vitest"

import { collectDbWriteTargets, collectImports } from "./_guardrail-ast"
import { financialSourceFiles, read } from "./financial-stage2-guardrail-utils"

const reconciliationBuilder =
	"src/modules/financial/application/use-cases/build-financial-reconciliation-match.ts"
const reconciliationRoute = "src/pages/api/internal/financial/reconciliation.ts"
const reconciliationQueueRoute = "src/pages/api/internal/financial/reconciliation-queue.ts"
const reconciliationReviewRoute =
	"src/pages/api/internal/financial/reconciliation-matches/review.ts"
const operationBuilder =
	"src/modules/financial/application/use-cases/build-financial-operation-review.ts"

describe("Guardrail: financial Stage 3.3 closure hardening", () => {
	it("keeps reconciliation review auditable and fingerprinted", () => {
		const domain = read("src/modules/financial/domain/financial-review-event.ts")
		const reviewRoute = read(reconciliationReviewRoute)
		const matchDomain = read("src/modules/financial/domain/reconciliation-match.ts")
		const required = [
			"reconciliation_match_reviewed",
			"reconciliation_review_reopened",
			"reconciliation_review_marked_stale",
			"comparisonFingerprint",
			"reviewFingerprint",
			"reviewState",
		]
		const violations = required.flatMap((token) =>
			`${domain}\n${reviewRoute}\n${matchDomain}`.includes(token) ? [] : [`missing ${token}`]
		)
		expect(violations).toEqual([])
	})

	it("requires granular mismatch reasons without PSP execution semantics", () => {
		const builder = read(reconciliationBuilder)
		const required = [
			"payment_amount_mismatch",
			"settlement_amount_mismatch",
			"duplicate_external_reference",
			"missing_capture_reference",
			"refund_without_matching_cancellation",
			"stale_review",
			"unmatched_payment_transaction",
			"unmatched_settlement_record",
		]
		const violations = required.flatMap((token) =>
			builder.includes(token) || read(reconciliationQueueRoute).includes(token)
				? []
				: [`missing mismatch reason ${token}`]
		)
		expect(violations).toEqual([])
	})

	it("isolates legacy reconciliation status as compatibility-only", () => {
		const route = read(reconciliationRoute)
		expect(route).toContain("deprecated")
		expect(route).toContain("compatibilityOnly")
		expect(route).toContain('replacement: "match.status"')
	})

	it("prevents provider finance from using shadow payout/payable sources", () => {
		const forbidden = [
			/netPayoutEstimate/,
			/commissionTotal/,
			/readFinancial.*Shadow/,
			/LegacySettlementShadow/,
			/FinancialShadowRecord/,
			/financial_shadow/,
		]
		const candidateFiles = financialSourceFiles.filter(
			(file) =>
				/provider|payout|payable|statement|commission/i.test(file) && file !== operationBuilder
		)
		const violations = candidateFiles.flatMap((file) => {
			const source = read(file)
			return forbidden.flatMap((pattern) =>
				pattern.test(source)
					? [`${file}: provider finance must not use shadow payable source ${pattern}`]
					: []
			)
		})
		expect(violations).toEqual([])
	})

	it("keeps reconciliation paths out of pricing/inventory runtime and booking mutation", () => {
		const sources = [
			reconciliationBuilder,
			reconciliationRoute,
			reconciliationQueueRoute,
			reconciliationReviewRoute,
		]
		const violations = sources.flatMap((file) => {
			const source = read(file)
			const imports = collectImports(file)
			const runtimeImports = imports.flatMap((entry) =>
				/modules\/pricing|modules\/inventory|lib\/pricing|lib\/inventory/.test(entry.module)
					? [`${file}: imports runtime ${entry.module}`]
					: []
			)
			const writes = collectDbWriteTargets(file).flatMap((write) => {
				const dbImports = new Map(
					imports
						.filter((entry) => entry.module === "astro:db")
						.map((entry) => [entry.local, entry.imported])
				)
				const target = dbImports.get(write.target) ?? write.target
				return [
					"Booking",
					"BookingRoomDetail",
					"BookingTaxFee",
					"Payment",
					"ProviderPayout",
					"ProviderPayoutBooking",
				].includes(target)
					? [`${file}: forbidden reconciliation write to ${target}`]
					: []
			})
			return [
				...runtimeImports,
				...writes,
				/executeRefund|capturePayment|settlePayout|sendPayout/.test(source)
					? `${file}: fake execution verb`
					: null,
			].filter(Boolean)
		})
		expect(violations).toEqual([])
	})
})
