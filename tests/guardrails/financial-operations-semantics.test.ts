import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { collectCalls, collectHttpExportMethods, collectImports } from "./_guardrail-ast"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

const financialPage = "src/pages/financial/index.astro"
const financialBff = "src/pages/api/internal/financial/operations.ts"
const financialDetector =
	"src/modules/financial/application/use-cases/detect-financial-exceptions.ts"
const financialReviewBuilder =
	"src/modules/financial/application/use-cases/build-financial-operation-review.ts"

const bannedRuntimeCalls = new Set([
	"computeEffectivePricingV2",
	"computePricePreview",
	"previewPricingRules",
	"materializeEffectivePricing",
	"createInventoryHold",
	"releaseInventoryHold",
	"consumeInventory",
	"materializeAvailability",
	"executeRefund",
	"capturePayment",
	"settlePayout",
	"issueInvoice",
	"createLedgerEntry",
])

const requiredFinancialStates = [
	"payment_intent_shadow_visible",
	"payment_recorded_shadow_visible",
	"refund_handoff_required",
	"refund_evidence_visible",
	"settlement_shadow_visible",
	"settlement_recorded_shadow_visible",
	"evidence_alignment_visibility",
]

const requiredExceptionSignals = [
	"operationalException",
	"openExceptions",
	"missingReferenceCount",
	"snapshotGapCount",
	"refund_handoff_required",
	"reconciliation_unknown",
	"missing_payment_reference",
	"missing_settlement_reference",
	"missing_refund_reference",
	"incomplete_contract_snapshot",
	"legacy_snapshot_compatibility",
	"multi_room_review",
	"nextOwner",
	"ageDays",
]

describe("Guardrail: Financial Operations enterprise semantics", () => {
	it("keeps financial read models snapshot-first and out of pricing/inventory engines", () => {
		const imports = collectImports(financialBff)
		const calls = collectCalls(financialBff)
		const violations = [
			...imports.flatMap((entry) => {
				if (entry.module.includes("/modules/pricing/") || entry.module.includes("/lib/pricing/")) {
					return [`${financialBff}: imports pricing runtime ${entry.module}`]
				}
				if (
					entry.module.includes("/modules/inventory/") ||
					entry.module.includes("/lib/inventory/")
				) {
					return [`${financialBff}: imports inventory runtime ${entry.module}`]
				}
				if (entry.module.includes("/modules/catalog/")) {
					return [`${financialBff}: imports catalog module ${entry.module}`]
				}
				return []
			}),
			...calls.flatMap((call) =>
				bannedRuntimeCalls.has(call.leaf)
					? [`${financialBff}: forbidden financial/runtime orchestration call ${call.calleePath}`]
					: []
			),
		]

		expect(
			violations,
			`Financial Operations may show booking/financial snapshots, not recompute or orchestrate external runtimes:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps financial operations BFF read-only and free of fake PSP/accounting workflows", () => {
		const source = read(financialBff)
		const methods = collectHttpExportMethods(financialBff)
		const forbidden = [
			/PaymentProvider/,
			/chargeback/i,
			/dispute/i,
			/retry payment/i,
			/execute refund/i,
			/settle payout/i,
			/issue invoice/i,
			/accounting automation/i,
		]
		const violations = [
			...[...methods].map((method) => `${financialBff}: exports ${method} on a read BFF`),
			...forbidden.flatMap((pattern) =>
				pattern.test(source) ? [`${financialBff}: fake finance workflow ${pattern}`] : []
			),
		]

		expect(
			violations,
			`Financial Operations must stay evidence/review visibility only, not PSP/accounting orchestration:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps contract value visibility multi-room snapshot aware", () => {
		const source = read(financialReviewBuilder)
		const confirmSource = read("src/pages/api/booking/confirm.ts")
		const violations = [
			source.includes("const detailTotal = group.reduce")
				? `${financialReviewBuilder}: contract total must use params.group.reduce explicitly`
				: null,
			source.includes("params.group.reduce")
				? null
				: `${financialReviewBuilder}: contract total must aggregate booking room snapshots`,
			source.includes("const contractTotal = detailTotal > 0 ? detailTotal : fallbackTotal")
				? null
				: `${financialReviewBuilder}: contract total must prefer room snapshot totals before booking fallback totals`,
			source.includes("const contractTotal = Number(first.detailTotalPrice")
				? `${financialReviewBuilder}: contract total must not use only the first room detail`
				: null,
			confirmSource.includes("const bookingDetails = await db") &&
			confirmSource.includes(".where(eq(BookingRoomDetail.bookingId, result.bookingId))") &&
			confirmSource.includes(".all()")
				? null
				: "src/pages/api/booking/confirm.ts: financial shadow write must read all room snapshots",
			confirmSource.includes("const roomTotal = bookingDetails.reduce")
				? null
				: "src/pages/api/booking/confirm.ts: financial shadow write must aggregate multi-room totals",
			confirmSource.includes("const finalTotal = roomTotal > 0 ? roomTotal : fallbackFinal")
				? null
				: "src/pages/api/booking/confirm.ts: financial shadow write must prefer room snapshot totals",
		].filter(Boolean)

		expect(
			violations,
			`Financial visibility must not understate multi-room booking contracts:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("requires explicit financial evidence and snapshot integrity semantics", () => {
		const source = `${read(financialBff)}\n${read(financialDetector)}\n${read(financialReviewBuilder)}`
		const page = read(financialPage)
		const requiredSignals = [
			...requiredFinancialStates,
			...requiredExceptionSignals,
			"deriveFinancialEvidenceVisibility",
			"deriveFinancialEvidenceAlignmentState",
			"financialEvidence",
			"snapshotIntegrity",
			"hasPaymentReference",
			"hasSettlementReference",
			"hasRefundReference",
			"multiRoomAllocationCount",
			"refund_handoff_visibility",
			"settlement_shadow_context_visible",
			"visibility_not_psp_orchestration",
			"evidence_matched",
			"evidence_partial",
			"evidence_unknown",
		]
		const forbiddenFakeLifecycle = [
			"authorization_visible",
			"partially_reconciled",
			"reconciled",
			"reconciliation_state",
			"capture_visible",
			"payment_intent_created",
			"refund_snapshot_visible",
			"settlement_visibility",
			"payout_visibility",
			"deriveTransactionLifecycle",
			"transactions?.shadowVisibility",
		]
		const violations = [
			...requiredSignals.flatMap((signal) =>
				source.includes(signal) ? [] : [`${financialBff}: missing ${signal}`]
			),
			...forbiddenFakeLifecycle.flatMap((signal) =>
				source.includes(signal) || page.includes(signal)
					? [`Financial Operations uses fake lifecycle naming ${signal}`]
					: []
			),
			page.includes("operation?.transactions?.financialEvidence?.paymentIntentShadow")
				? null
				: `${financialPage}: transaction column must render financial evidence semantics`,
			page.includes("operation?.operationalException?.all")
				? null
				: `${financialPage}: financial table must preserve derived operational exception fallback`,
			page.includes("operation?.snapshotIntegrity?.multiRoomAllocationCount")
				? null
				: `${financialPage}: tax/invoice column must expose snapshot allocation completeness`,
		].filter(Boolean)

		expect(
			violations,
			`Financial Operations must expose evidence and snapshot integrity semantics, not fake lifecycle counters:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("requires honest finance UX framing without command-center or analytics theater", () => {
		const source = read(financialPage)
		const requiredSignals = [
			"Review queue",
			"Open exceptions",
			"Missing references",
			"Snapshot gaps",
			"Clean records",
			"No items match this queue",
		]
		const forbiddenTheater = [
			/command center/i,
			/\bAI\b/i,
			/forecast/i,
			/revenue optimization/i,
			/Endpoint latency/i,
			/Ownership<\/p>/,
			/Financial exception review/,
			/Operations requiring finance review/,
			/Financial exceptions requiring review/,
			/Financial lifecycle visibility/,
			/Snapshot ready/,
			/financial dashboard/i,
			/executive KPI/i,
			/no\s+ejecuta\s+PSP/i,
			/ni ledger/i,
		]
		const violations = [
			...requiredSignals.flatMap((signal) =>
				source.includes(signal) ? [] : [`${financialPage}: missing ${signal}`]
			),
			...forbiddenTheater.flatMap((pattern) =>
				pattern.test(source) ? [`${financialPage}: forbidden finance theater ${pattern}`] : []
			),
		]

		expect(
			violations,
			`Financial UX must communicate operational visibility without theater:\n${violations.join("\n")}`
		).toEqual([])
	})
})
