/**
 * Stage 3 truth boundary for Provider Finance foundations.
 *
 * Stage 4 may build provider finance visibility from these truth sources. Compatibility evidence
 * remains readable for legacy surfaces, but it must not become payable, payout, or statement truth.
 */
export const STAGE3_FINANCIAL_TRUTH_SOURCES = [
	"PaymentTransaction",
	"FinancialSettlementRecord",
	"ReconciliationMatch",
	"BookingRoomDetailSnapshotAggregation",
] as const

export const STAGE3_COMPATIBILITY_ONLY_SOURCES = [
	"FinancialShadowRecord",
	"FinancialReference",
	"FinancialReviewEvent",
	"LegacyPaymentIntentShadow",
	"LegacySettlementShadow",
	"LegacyRefundShadow",
	"Payment",
	"ProviderPayout",
	"ProviderPayoutBooking",
	"evidenceAlignment",
	"legacyReconciliationStatus",
	"netPayoutEstimate",
	"commissionTotal",
] as const

export type Stage3FinancialTruthSource = (typeof STAGE3_FINANCIAL_TRUTH_SOURCES)[number]
export type Stage3CompatibilityOnlySource = (typeof STAGE3_COMPATIBILITY_ONLY_SOURCES)[number]
