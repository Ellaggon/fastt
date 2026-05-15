import {
	detectFinancialExceptions,
	type DetectedFinancialException,
} from "./detect-financial-exceptions"

export type FinancialEvidenceAlignmentState =
	| "snapshot_ready"
	| "handoff_pending"
	| "evidence_partial"
	| "evidence_matched"
	| "evidence_unknown"

export type PaymentIntentEvidence = "not_visible" | "payment_intent_shadow_visible"
export type RecordedPaymentEvidence = "not_visible" | "payment_recorded_shadow_visible"
export type RefundEvidence =
	| "not_applicable"
	| "refund_handoff_required"
	| "refund_evidence_visible"
export type SettlementEvidence = "not_visible" | "settlement_shadow_visible"
export type RecordedSettlementEvidence = "not_visible" | "settlement_recorded_shadow_visible"

export type FinancialEvidenceVisibility = {
	paymentIntentShadow: PaymentIntentEvidence
	recordedPaymentShadow: RecordedPaymentEvidence
	refundEvidence: RefundEvidence
	settlementShadow: SettlementEvidence
	recordedSettlementShadow: RecordedSettlementEvidence
}

export type FinancialOperationBookingRow = {
	bookingId: string
	status: unknown
	currency: unknown
	totalAmountUSD: unknown
	totalAmountBOB: unknown
	confirmedAt: unknown
	checkInDate: unknown
	checkOutDate: unknown
	refundHandoffSnapshotJson: unknown
	contractSnapshotVersion: unknown
	detailId: unknown
	detailTotalPrice: unknown
	detailTaxes: unknown
	providerIdSnapshot: unknown
	productNameSnapshot: unknown
	variantNameSnapshot: unknown
	ratePlanNameSnapshot: unknown
	productName: unknown
	variantName: unknown
}

export type FinancialShadowEvidenceRow = {
	bookingId: string
	type: string
	payload: unknown
	createdAt?: unknown
}

export type BookingTaxFeeSnapshotRow = {
	bookingId: string
	totalAmount?: unknown
	breakdownJson?: unknown
}

export function dateOnly(value: unknown): string | null {
	if (!value) return null
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	const raw = String(value).trim()
	if (!raw) return null
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
	const parsed = new Date(raw)
	if (Number.isNaN(parsed.getTime())) return null
	return parsed.toISOString().slice(0, 10)
}

export function readFinancialShadowAmount(payload: unknown): number | null {
	if (!payload || typeof payload !== "object") return null
	const value = Number((payload as any).amount ?? (payload as any).grossAmount ?? NaN)
	return Number.isFinite(value) ? value : null
}

export function readFinancialShadowReference(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null
	for (const key of ["transactionId", "captureId", "authorizationId", "id", "idempotencyKey"]) {
		const value = String((payload as any)[key] ?? "").trim()
		if (value) return value
	}
	return null
}

export function readFinancialShadowStatus(payload: unknown): string {
	if (!payload || typeof payload !== "object") return "unknown"
	return (
		String((payload as any).status ?? "unknown")
			.trim()
			.toLowerCase() || "unknown"
	)
}

export function readFinancialShadowCommission(payload: unknown): number {
	if (!payload || typeof payload !== "object") return 0
	const value = Number((payload as any).commissionAmount ?? 0)
	return Number.isFinite(value) ? value : 0
}

function hasRecorded(rows: Array<{ payload: unknown }>): boolean {
	return rows.some((row) => readFinancialShadowStatus(row.payload) === "recorded")
}

function allRecorded(rows: Array<{ payload: unknown }>): boolean {
	return (
		rows.length > 0 && rows.every((row) => readFinancialShadowStatus(row.payload) === "recorded")
	)
}

function anyRecorded(rows: Array<{ payload: unknown }>): boolean {
	return rows.some((row) => readFinancialShadowStatus(row.payload) === "recorded")
}

export function daysSince(value: unknown): number | null {
	if (!value) return null
	const date = value instanceof Date ? value : new Date(String(value))
	if (Number.isNaN(date.getTime())) return null
	return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
}

export function deriveFinancialEvidenceVisibility(params: {
	status: string
	paymentIntents: Array<{ payload: unknown }>
	settlementRecords: Array<{ payload: unknown }>
	refundRecords: Array<{ payload: unknown }>
	refundSnapshot: Record<string, unknown> | null
}): FinancialEvidenceVisibility {
	const hasPaymentIntent = params.paymentIntents.length > 0
	const hasRecordedPayment = anyRecorded(params.paymentIntents)
	const hasSettlement = params.settlementRecords.length > 0
	const hasRecordedSettlement = anyRecorded(params.settlementRecords)
	const hasRefundSnapshot = params.refundRecords.length > 0 || params.refundSnapshot != null
	const isCancelled = params.status.toLowerCase() === "cancelled"

	return {
		paymentIntentShadow: hasPaymentIntent ? "payment_intent_shadow_visible" : "not_visible",
		recordedPaymentShadow: hasRecordedPayment ? "payment_recorded_shadow_visible" : "not_visible",
		refundEvidence: hasRefundSnapshot
			? "refund_evidence_visible"
			: isCancelled
				? "refund_handoff_required"
				: "not_applicable",
		settlementShadow: hasSettlement ? "settlement_shadow_visible" : "not_visible",
		recordedSettlementShadow: hasRecordedSettlement
			? "settlement_recorded_shadow_visible"
			: "not_visible",
	}
}

export function deriveFinancialEvidenceAlignmentState(params: {
	status: string
	contractTotal: number
	paymentIntents: Array<{ payload: unknown }>
	settlementRecords: Array<{ payload: unknown }>
	refundRecords: Array<{ payload: unknown }>
}): FinancialEvidenceAlignmentState {
	const isCancelled = params.status.toLowerCase() === "cancelled"
	if (isCancelled && params.refundRecords.length === 0) return "handoff_pending"

	const hasFinancialShadow = params.paymentIntents.length > 0 || params.settlementRecords.length > 0
	if (!hasFinancialShadow) return "snapshot_ready"

	const paymentMatches = params.paymentIntents.some(
		(row) => readFinancialShadowAmount(row.payload) === params.contractTotal
	)
	const settlementMatches = params.settlementRecords.some(
		(row) => readFinancialShadowAmount(row.payload) === params.contractTotal
	)
	if (
		paymentMatches &&
		settlementMatches &&
		allRecorded(params.paymentIntents) &&
		allRecorded(params.settlementRecords)
	) {
		return "evidence_matched"
	}
	if (
		paymentMatches ||
		settlementMatches ||
		hasRecorded(params.paymentIntents) ||
		hasRecorded(params.settlementRecords)
	) {
		return "evidence_partial"
	}
	return "evidence_unknown"
}

export function buildFinancialOperationReview(params: {
	group: FinancialOperationBookingRow[]
	shadowRows: FinancialShadowEvidenceRow[]
	taxRows: BookingTaxFeeSnapshotRow[]
	providerId: string
}) {
	const first = params.group[0]
	const currency =
		String(first.currency ?? "USD")
			.trim()
			.toUpperCase() || "USD"
	const fallbackTotal =
		currency === "BOB" ? Number(first.totalAmountBOB ?? 0) : Number(first.totalAmountUSD ?? 0)
	const detailTotal = params.group.reduce((sum, row) => sum + Number(row.detailTotalPrice ?? 0), 0)
	const contractTotal = detailTotal > 0 ? detailTotal : fallbackTotal
	const taxesTotal = params.group.reduce((sum, row) => sum + Number(row.detailTaxes ?? 0), 0)
	const paymentIntents = params.shadowRows.filter((row) => row.type === "payment_intent")
	const settlementRecords = params.shadowRows.filter((row) => row.type === "settlement_record")
	const refundRecords = params.shadowRows.filter((row) => row.type === "refund_record")
	// Compatibility visibility only. Provider Finance must create its own payable snapshots from
	// Stage 3 truth sources rather than treating shadow commission/net payout values as final.
	const commissionTotal = settlementRecords.reduce(
		(sum, row) => sum + readFinancialShadowCommission(row.payload),
		0
	)
	const evidenceAlignmentState = deriveFinancialEvidenceAlignmentState({
		status: String(first.status ?? "draft"),
		contractTotal,
		paymentIntents,
		settlementRecords,
		refundRecords,
	})
	const refundSnapshot =
		first.refundHandoffSnapshotJson && typeof first.refundHandoffSnapshotJson === "object"
			? (first.refundHandoffSnapshotJson as Record<string, unknown>)
			: null
	const financialEvidence = deriveFinancialEvidenceVisibility({
		status: String(first.status ?? "draft"),
		paymentIntents,
		settlementRecords,
		refundRecords,
		refundSnapshot,
	})
	const paymentReferences = paymentIntents
		.map((row) => readFinancialShadowReference(row.payload))
		.filter(Boolean)
	const settlementReferences = settlementRecords
		.map((row) => readFinancialShadowReference(row.payload))
		.filter(Boolean)
	const refundReferences = refundRecords
		.map((row) => readFinancialShadowReference(row.payload))
		.filter(Boolean)
	const hasRoomSnapshots = params.group.some(
		(row) => row.productNameSnapshot != null && row.variantNameSnapshot != null
	)
	const hasTaxFeeSnapshots = params.taxRows.length > 0
	const hasPaymentReference = paymentReferences.length > 0
	const hasSettlementReference = settlementReferences.length > 0
	const hasRefundReference = refundReferences.length > 0 || refundSnapshot != null
	const multiRoomAllocationCount = params.group.filter((row) => row.detailId != null).length
	const snapshotVersion = first.contractSnapshotVersion ?? "legacy_snapshot_compatibility"
	const exceptions: DetectedFinancialException[] = detectFinancialExceptions({
		bookingId: first.bookingId,
		providerId: String(first.providerIdSnapshot ?? params.providerId),
		evidenceAlignmentState,
		financialEvidence,
		paymentIntentCount: paymentIntents.length,
		settlementRecordCount: settlementRecords.length,
		hasPaymentReference,
		hasSettlementReference,
		hasRefundReference,
		hasRoomSnapshots,
		hasTaxFeeSnapshots,
		taxesTotal,
		multiRoomAllocationCount,
		snapshotVersion: String(snapshotVersion),
	})
	const primaryException =
		exceptions.find((entry) => entry.severity === "attention") ?? exceptions[0] ?? null

	return {
		bookingId: first.bookingId,
		status: String(first.status ?? "draft"),
		currency,
		contractTotal,
		taxesTotal,
		commissionTotal,
		netPayoutEstimate: Math.max(0, contractTotal - commissionTotal),
		confirmedAt: first.confirmedAt ?? null,
		stay: {
			checkIn: dateOnly(first.checkInDate),
			checkOut: dateOnly(first.checkOutDate),
		},
		contract: {
			version: first.contractSnapshotVersion ?? "legacy_snapshot_compatibility",
			productName: first.productNameSnapshot ?? first.productName ?? null,
			variantName: first.variantNameSnapshot ?? first.variantName ?? null,
			ratePlanName: first.ratePlanNameSnapshot ?? null,
			snapshotFirst: Boolean(first.productNameSnapshot && first.variantNameSnapshot),
		},
		transactions: {
			paymentIntents: paymentIntents.length,
			settlementRecords: settlementRecords.length,
			refundRecords: refundRecords.length,
			statuses: [
				...new Set(params.shadowRows.map((row) => readFinancialShadowStatus(row.payload))),
			],
			financialEvidence,
			references: {
				payment: paymentReferences,
				settlement: settlementReferences,
				refund: refundReferences,
			},
		},
		refund: {
			state: financialEvidence.refundEvidence,
			owner: "Payments & Finance",
			boundary: "visibility_only",
			cancellationLinked: String(first.status ?? "").toLowerCase() === "cancelled",
			references: refundReferences,
		},
		providerSettlementEvidence: {
			state: financialEvidence.recordedSettlementShadow,
			basis: "financial_shadow_record",
			settlementEvidence: financialEvidence.settlementShadow,
			references: settlementReferences,
		},
		invoice: {
			state: "reference_not_issued",
			reference: null,
			basis: "booking_contract_snapshot",
		},
		taxFeeVisibility: {
			lines: params.taxRows.length,
			basis: "booking_tax_fee_snapshot",
		},
		evidenceAlignment: {
			state: evidenceAlignmentState,
			visibility: "evidence_alignment_visibility",
			basis: "snapshot_and_financial_shadow_evidence",
			owner: "Payments & Finance",
			context:
				evidenceAlignmentState === "handoff_pending"
					? "refund_handoff_visibility"
					: financialEvidence.settlementShadow === "settlement_shadow_visible"
						? "settlement_shadow_context_visible"
						: "snapshot_visibility",
		},
		snapshotIntegrity: {
			contractSnapshotVersion: snapshotVersion,
			hasRoomSnapshots,
			hasTaxFeeSnapshots,
			hasPaymentReference,
			hasSettlementReference,
			hasRefundReference,
			multiRoomAllocationCount,
		},
		operationalException: {
			hasOpenException: exceptions.some((entry) => entry.severity === "attention"),
			primary: primaryException,
			all: exceptions,
			ageDays: daysSince(first.confirmedAt),
		},
	}
}
