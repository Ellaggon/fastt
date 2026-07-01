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

export type PaymentIntentEvidence = "not_visible" | "payment_evidence_visible"
export type RecordedPaymentEvidence = "not_visible" | "payment_recorded_evidence_visible"
export type RefundEvidence =
	| "not_applicable"
	| "refund_handoff_required"
	| "refund_evidence_visible"
export type SettlementEvidence = "not_visible" | "settlement_evidence_visible"
export type RecordedSettlementEvidence = "not_visible" | "settlement_recorded_evidence_visible"

export type FinancialEvidenceVisibility = {
	paymentEvidence: PaymentIntentEvidence
	recordedPaymentEvidence: RecordedPaymentEvidence
	refundEvidence: RefundEvidence
	settlementEvidence: SettlementEvidence
	recordedSettlementEvidence: RecordedSettlementEvidence
}

export type FinancialOperationBookingRow = {
	bookingId: string
	status: unknown
	currency: unknown
	totalAmount: unknown
	confirmedAt: unknown
	guestNameSnapshot?: unknown
	providerDisplayName?: unknown
	providerLegalName?: unknown
	checkInDate: unknown
	checkOutDate: unknown
	refundHandoffSnapshotJson: unknown
	contractSnapshotVersion: unknown
	detailId: unknown
	detailTotalAmount: unknown
	detailTaxAmount: unknown
	providerIdSnapshot: unknown
	productNameSnapshot: unknown
	variantNameSnapshot: unknown
	ratePlanNameSnapshot: unknown
	productName: unknown
	variantName: unknown
}

export type FinancialEvidenceRow = {
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

export function readFinancialEvidenceAmount(payload: unknown): number | null {
	if (!payload || typeof payload !== "object") return null
	const value = Number((payload as any).amount ?? (payload as any).grossAmount ?? NaN)
	return Number.isFinite(value) ? value : null
}

export function readFinancialEvidenceReference(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null
	for (const key of ["transactionId", "captureId", "authorizationId", "id", "idempotencyKey"]) {
		const value = String((payload as any)[key] ?? "").trim()
		if (value) return value
	}
	return null
}

export function readFinancialEvidenceStatus(payload: unknown): string {
	if (!payload || typeof payload !== "object") return "unknown"
	return (
		String((payload as any).status ?? "unknown")
			.trim()
			.toLowerCase() || "unknown"
	)
}

function hasRecorded(rows: Array<{ payload: unknown }>): boolean {
	return rows.some((row) => readFinancialEvidenceStatus(row.payload) === "recorded")
}

function allRecorded(rows: Array<{ payload: unknown }>): boolean {
	return (
		rows.length > 0 && rows.every((row) => readFinancialEvidenceStatus(row.payload) === "recorded")
	)
}

function anyRecorded(rows: Array<{ payload: unknown }>): boolean {
	return rows.some((row) => readFinancialEvidenceStatus(row.payload) === "recorded")
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
		paymentEvidence: hasPaymentIntent ? "payment_evidence_visible" : "not_visible",
		recordedPaymentEvidence: hasRecordedPayment
			? "payment_recorded_evidence_visible"
			: "not_visible",
		refundEvidence: hasRefundSnapshot
			? "refund_evidence_visible"
			: isCancelled
				? "refund_handoff_required"
				: "not_applicable",
		settlementEvidence: hasSettlement ? "settlement_evidence_visible" : "not_visible",
		recordedSettlementEvidence: hasRecordedSettlement
			? "settlement_recorded_evidence_visible"
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

	const hasFinancialEvidence =
		params.paymentIntents.length > 0 || params.settlementRecords.length > 0
	if (!hasFinancialEvidence) return "snapshot_ready"

	const paymentMatches = params.paymentIntents.some(
		(row) => readFinancialEvidenceAmount(row.payload) === params.contractTotal
	)
	const settlementMatches = params.settlementRecords.some(
		(row) => readFinancialEvidenceAmount(row.payload) === params.contractTotal
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
	financialEvidenceRows: FinancialEvidenceRow[]
	taxRows: BookingTaxFeeSnapshotRow[]
	providerId: string
}) {
	const first = params.group[0]
	const currency =
		String(first.currency ?? "USD")
			.trim()
			.toUpperCase() || "USD"
	const fallbackTotal = Number(first.totalAmount ?? 0)
	const detailTotal = params.group.reduce((sum, row) => sum + Number(row.detailTotalAmount ?? 0), 0)
	const contractTotal = detailTotal > 0 ? detailTotal : fallbackTotal
	const taxesTotal = params.group.reduce((sum, row) => sum + Number(row.detailTaxAmount ?? 0), 0)
	const paymentIntents = params.financialEvidenceRows.filter((row) => row.type === "payment_intent")
	const settlementRecords = params.financialEvidenceRows.filter(
		(row) => row.type === "settlement_record"
	)
	const refundRecords = params.financialEvidenceRows.filter((row) => row.type === "refund_record")
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
		.map((row) => readFinancialEvidenceReference(row.payload))
		.filter(Boolean)
	const settlementReferences = settlementRecords
		.map((row) => readFinancialEvidenceReference(row.payload))
		.filter(Boolean)
	const refundReferences = refundRecords
		.map((row) => readFinancialEvidenceReference(row.payload))
		.filter(Boolean)
	const hasRoomSnapshots = params.group.some(
		(row) => row.productNameSnapshot != null && row.variantNameSnapshot != null
	)
	const hasTaxFeeSnapshots = params.taxRows.length > 0
	const hasPaymentReference = paymentReferences.length > 0
	const hasSettlementReference = settlementReferences.length > 0
	const hasRefundReference = refundReferences.length > 0 || refundSnapshot != null
	const multiRoomAllocationCount = params.group.filter((row) => row.detailId != null).length
	const snapshotVersion = first.contractSnapshotVersion ?? "missing_contract_snapshot_version"
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
		confirmedAt: first.confirmedAt ?? null,
		guestName: first.guestNameSnapshot ?? null,
		providerName: first.providerDisplayName ?? first.providerLegalName ?? null,
		stay: {
			checkIn: dateOnly(first.checkInDate),
			checkOut: dateOnly(first.checkOutDate),
		},
		contract: {
			version: first.contractSnapshotVersion ?? "missing_contract_snapshot_version",
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
				...new Set(
					params.financialEvidenceRows.map((row) => readFinancialEvidenceStatus(row.payload))
				),
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
			state: financialEvidence.recordedSettlementEvidence,
			basis: "financial_evidence",
			settlementEvidence: financialEvidence.settlementEvidence,
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
			basis: "snapshot_and_financial_evidence",
			owner: "Payments & Finance",
			context:
				evidenceAlignmentState === "handoff_pending"
					? "refund_handoff_visibility"
					: financialEvidence.settlementEvidence === "settlement_evidence_visible"
						? "settlement_evidence_context_visible"
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
