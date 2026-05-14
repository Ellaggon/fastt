export const FINANCIAL_REFERENCE_TYPES = [
	"payment_evidence",
	"refund_evidence",
	"settlement_evidence",
	"invoice_reference",
] as const

export type FinancialReferenceType = (typeof FINANCIAL_REFERENCE_TYPES)[number]
export type FinancialReferenceSource =
	| "financial_shadow_record"
	| "operator_entry"
	| "legacy_payload"
	| "import"
export type FinancialReferenceBasis =
	| "financial_evidence"
	| "external_reference"
	| "contract_snapshot"
	| "legacy_payload"

export type FinancialReference = {
	id: string
	bookingId: string
	providerId: string
	type: FinancialReferenceType
	referenceValue: string
	externalSystem?: string | null
	amount?: number | null
	currency?: string | null
	recordedAt: Date
	source: FinancialReferenceSource
	basis: FinancialReferenceBasis
	createdAt: Date
}
