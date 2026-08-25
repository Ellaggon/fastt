import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("historical PostgreSQL schema reconciliation", () => {
	it("keeps the application contract strict for private request parties", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		expect(schema).toContain('partyJson: jsonb("partyJson").notNull()')
	})

	it("reconciles historical nullability and UTC timestamps in one tracked migration", () => {
		const migration = read("db/migrations/2026-09-10_reconcile_historical_schema_contracts.sql")
		expect(migration).toContain("USING \"nextSyncAt\" AT TIME ZONE 'UTC'")
		expect(migration).toContain("USING \"lastAutomaticSyncAt\" AT TIME ZONE 'UTC'")
		for (const table of [
			"BookingVoucher",
			"MarketplaceEvent",
			"ProductCategory",
			"ProductCategoryLink",
			"ProductReview",
			"TourPrivateRequest",
			"TourSlotProfile",
			"TourTicketType",
		]) {
			expect(migration).toContain(`ALTER TABLE "${table}"`)
		}
		const retirement = read("db/migrations/2026-09-11_retire_historical_backfill_artifacts.sql")
		expect(retirement).toContain("TOUR_CATEGORY_BACKFILL_REQUIRES_REVIEW")
		expect(retirement).toContain("DUPLICATE_CATEGORY_CANONICAL_TARGET_INVALID")
		expect(retirement).toContain('INSERT INTO "ProductCategoryLink"')
		expect(retirement).toContain('DELETE FROM "ProductCategoryLink"')
		expect(retirement).toContain('DELETE FROM "ProductCategory"')
		expect(retirement).toContain('DROP TABLE "MarketplaceCatalogSanitationAudit"')
		expect(retirement).toContain('DROP TABLE "TourCategoryBackfillUnmapped"')
	})

	it("does not mistake the migration ledger for an unmanaged domain table", () => {
		const verifier = read("scripts/db/verify-postgres-initial-schema.ts")
		expect(verifier).toContain(
			'operationalInfrastructureTables = new Set(["fastt_schema_migrations"])'
		)
	})
})
