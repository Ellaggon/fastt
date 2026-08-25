import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("hold commercial snapshot contract", () => {
	it("persists a versioned quote and complete commercial snapshot on every new hold", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const repository = read(
			"src/modules/inventory/infrastructure/repositories/InventoryHoldRepository.ts"
		)
		const booking = read(
			"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
		)
		const migration = read("db/migrations/2026-09-12_hold_commercial_snapshot.sql")
		const writerCutover = read(
			"db/migrations/2026-09-13_hold_commercial_snapshot_require_writer_version.sql"
		)

		for (const field of ["commercialSnapshotVersion", "priceQuoteId", "commercialSnapshotJson"]) {
			expect(schema).toContain(field)
			expect(migration).toContain(`"${field}"`)
		}
		expect(schema).toContain("Hold_commercial_snapshot_check")
		expect(schema).toContain(
			'commercialSnapshotVersion: text("commercialSnapshotVersion").notNull()'
		)
		expect(writerCutover).toContain('ALTER COLUMN "commercialSnapshotVersion" DROP DEFAULT')
		expect(schema).toContain("-> 'priceQuote' ->> 'quoteId'")
		expect(repository).toContain("HOLD_COMMERCIAL_SNAPSHOT_VERSION")
		expect(repository).toContain("commercialSnapshotJson: params.commercialSnapshot")
		expect(repository).toContain("priceQuoteId: params.commercialSnapshot.priceQuote.quoteId")
		expect(booking).toContain("HOLD_COMMERCIAL_SNAPSHOT_MISSING")
	})

	it("keeps checkout independent from the cache", () => {
		const booking = read(
			"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
		)
		expect(booking).toContain("commercialSnapshotJson: Hold.commercialSnapshotJson")
		expect(booking).toContain("isHoldCommercialSnapshot")
		expect(booking).not.toContain("holdPricingSnapshot")
		expect(booking).not.toContain("holdPolicySnapshot")
		expect(booking).not.toContain("persistentCache")
		expect(booking).not.toContain("computeTaxBreakdown")
		expect(booking).not.toContain("resolveEffectiveTaxFees")
	})
})
