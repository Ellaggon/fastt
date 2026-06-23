import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("Guardrail: canonical booking operations schema", () => {
	const schema = read("db/config.ts")
	const migration = read("db/migrations/2026-06-22_booking_operations_schema_convergence.sql")
	const repository = read(
		"src/modules/booking/infrastructure/repositories/BookingOperationsQueryRepository.ts"
	)
	const bookingWriter = read(
		"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
	)

	it("keeps one contractual booking amount and direct provider ownership", () => {
		expect(schema).toContain("providerId: column.text({ references: () => Provider.columns.id })")
		expect(schema).toContain("totalAmount: column.number()")
		expect(schema).not.toContain("totalAmountUSD: column.number")
		expect(schema).not.toContain("totalAmountBOB: column.number")
		expect(bookingWriter).toContain("providerId: product.providerId")
		expect(bookingWriter).toContain("totalAmount: finalTotal")
	})

	it("separates contractual and operational lifecycle", () => {
		for (const field of [
			"operationalStatus",
			"checkedInAt",
			"checkedInBy",
			"checkedOutAt",
			"checkedOutBy",
			"noShowAt",
			"noShowBy",
		]) {
			expect(schema).toContain(`${field}:`)
			expect(repository).toContain(field)
		}
		expect(repository).toContain('operationalStatus === "checked_in"')
		expect(repository).toContain('operationalStatus === "checked_out"')
	})

	it("uses unambiguous room amounts and date-only hotel stays", () => {
		for (const field of ["subtotalAmount", "taxAmount", "totalAmount"]) {
			expect(schema).toContain(`${field}: column.number()`)
			expect(bookingWriter).toContain(`${field}:`)
		}
		expect(schema).toContain("checkInDate: column.text()")
		expect(schema).toContain("checkOutDate: column.text()")
		expect(bookingWriter).toContain("checkInDate: snapshot.from")
		expect(bookingWriter).toContain("checkOutDate: snapshot.to")
	})

	it("enforces booking indexes and snapshot integrity in the migration", () => {
		for (const fragment of [
			'FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id")',
			'CREATE INDEX "Booking_provider_status_checkin_idx"',
			'CREATE INDEX "Booking_provider_operation_checkout_idx"',
			'CREATE UNIQUE INDEX "BookingPolicySnapshot_booking_category_uq"',
		]) {
			expect(migration).toContain(fragment)
		}
	})

	it("routes operational reads through one repository", () => {
		expect(repository).not.toContain("totalPrice: totalAmount")
		expect(repository).not.toContain("total: totalAmount")
		for (const endpoint of [
			"src/pages/api/internal/provider-bookings-summary.ts",
			"src/pages/api/internal/booking-summary.ts",
		]) {
			const source = read(endpoint)
			expect(source).toContain("bookingOperationsQueryRepository")
			expect(source).not.toContain("deriveLifecycle")
		}
	})
})
