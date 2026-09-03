import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")
const schema = read("src/shared/infrastructure/db/schema/tables.ts")
const migration = read("db/migrations/2026-10-18_harden_financial_relational_integrity.sql")
const canonicalIntegrity = read(
	"src/shared/infrastructure/db/schema/financial-relational-integrity.sql"
)
const completionMigration = read(
	"db/migrations/2026-10-28_complete_financial_evidence_integrity.sql"
)

function tableSource(table: string) {
	const start = schema.indexOf(`export const ${table} = pgTable(`)
	const end = schema.indexOf("\nexport const ", start + 1)
	return schema.slice(start, end < 0 ? undefined : end)
}

describe("Guardrail: financial relational integrity", () => {
	it("keeps booking-bound financial records behind booking and provider FKs", () => {
		for (const table of [
			"FinancialExceptionRecord",
			"FinancialReference",
			"RefundHandoffRecord",
			"RefundQuote",
			"RefundLedger",
			"FinancialReviewEvent",
			"ReconciliationMatch",
			"CommissionSnapshot",
			"ProviderPayableSnapshot",
		]) {
			const source = tableSource(table)
			expect(source).toContain('bookingId: txt("bookingId").references(() => Booking.id)')
			expect(source).toContain('providerId: txt("providerId").references(() => Provider.id)')
		}
	})

	it("models external evidence as unlinked instead of inventing synthetic booking IDs", () => {
		for (const table of ["PaymentTransaction", "FinancialSettlementRecord"]) {
			expect(tableSource(table)).toContain(
				'bookingId: txtOpt("bookingId").references(() => Booking.id)'
			)
		}
		for (const path of [
			"src/pages/api/internal/financial/transactions.ts",
			"src/pages/api/internal/financial/settlements.ts",
			"src/modules/financial/infrastructure/repositories/PaymentTransactionRepository.ts",
			"src/modules/financial/infrastructure/repositories/FinancialSettlementRecordRepository.ts",
		]) {
			expect(read(path)).not.toContain("unmatched:")
		}
	})

	it("preserves the sanitation migration without retaining superseded runtime triggers", () => {
		expect(migration).toContain("FINANCIAL_INTEGRITY_UNCLASSIFIED_REFUND_QUOTES")
		expect(migration).toContain("FINANCIAL_BOOKING_PROVIDER_MISMATCH")
		expect(canonicalIntegrity).toContain(
			"DROP FUNCTION IF EXISTS fastt_validate_financial_booking_provider()"
		)
		expect(
			read("src/shared/infrastructure/db/schema/postgres-integrity.sql")
		).not.toContain("fastt_validate_financial_booking_provider")
	})

	it("enforces ownership and lineage with composite foreign keys", () => {
		for (const table of [
			"FinancialExceptionRecord",
			"FinancialReference",
			"RefundHandoffRecord",
			"RefundQuote",
			"RefundLedger",
			"FinancialReviewEvent",
			"PaymentTransaction",
			"FinancialSettlementRecord",
			"ReconciliationMatch",
			"CommissionSnapshot",
			"ProviderPayableSnapshot",
			"PayoutRecord",
		]) {
			expect(canonicalIntegrity).toContain(`${table}_booking_provider_fk`)
		}
		expect(canonicalIntegrity).toContain("RefundLedger_quote_lineage_fk")
		expect(canonicalIntegrity).toContain("RefundLedger_payment_lineage_fk")
		expect(canonicalIntegrity).toContain("FinancialReviewEvent_payment_lineage_fk")
		expect(canonicalIntegrity).toContain("FinancialReviewEvent_settlement_lineage_fk")
		expect(canonicalIntegrity).toContain("BOOKING_PROVIDER_IDENTITY_IMMUTABLE")
		expect(completionMigration).toContain("BOOKING_PROVIDER_IDENTITY_IMMUTABLE")
	})

	it("models external evidence association as an audited one-way transition", () => {
		const event = tableSource("FinancialReviewEvent")
		expect(event).toContain("paymentTransactionId")
		expect(event).toContain("settlementRecordId")
		expect(event).toContain("FinancialReviewEvent_external_association_target_check")
		expect(canonicalIntegrity).toContain("FINANCIAL_EVIDENCE_BOOKING_IMMUTABLE")
		expect(canonicalIntegrity).toContain("FINANCIAL_REVIEW_EVENT_IMMUTABLE")
		const repository = read(
			"src/modules/financial/infrastructure/repositories/ExternalFinancialEvidenceAssociationRepository.ts"
		)
		expect(repository).toContain('for("update")')
		expect(repository).toContain("external_evidence_associated")
	})
})
