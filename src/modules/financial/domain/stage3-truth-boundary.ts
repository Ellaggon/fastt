/**
 * Stage 3 truth boundary for future Provider Finance foundations.
 *
 * These constants document what Stage 4 may build on. They are intentionally declarative so
 * guardrails can fail when provider finance code starts from compatibility evidence instead of
 * the Stage 3 financial evidence models.
 */
export const STAGE3_FINANCIAL_TRUTH_SOURCES = [
	"PaymentTransaction",
	"FinancialSettlementRecord",
	"ReconciliationMatch",
	"BookingRoomDetailSnapshotAggregation",
] as const

export const STAGE3_COMPATIBILITY_ONLY_SOURCES = [
	"FinancialReference",
	"FinancialReviewEvent",
	"Payment",
	"ProviderPayout",
	"ProviderPayoutBooking",
	"evidenceAlignment",
	"legacyReconciliationStatus",
] as const

export type Stage3FinancialTruthSource = (typeof STAGE3_FINANCIAL_TRUTH_SOURCES)[number]
export type Stage3CompatibilityOnlySource = (typeof STAGE3_COMPATIBILITY_ONLY_SOURCES)[number]
