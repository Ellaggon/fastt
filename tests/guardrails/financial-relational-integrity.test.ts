import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")
const schema = read("src/shared/infrastructure/db/schema/tables.ts")
const integrity = read("src/shared/infrastructure/db/schema/postgres-integrity.sql")
const migration = read("db/migrations/2026-10-18_harden_financial_relational_integrity.sql")

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

	it("enforces provider, refund and review lineage in PostgreSQL", () => {
		expect(integrity).toContain("fastt_validate_financial_booking_provider")
		expect(integrity).toContain("fastt_validate_refund_ledger_lineage")
		expect(integrity).toContain("fastt_validate_financial_review_event_lineage")
		expect(migration).toContain("FINANCIAL_INTEGRITY_UNCLASSIFIED_REFUND_QUOTES")
		expect(migration).toContain("FINANCIAL_BOOKING_PROVIDER_MISMATCH")
	})
})
