import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("public marketplace data isolation", () => {
	it("keeps non-production products, content and categories out of anonymous surfaces", () => {
		const destinationListings = read("src/lib/marketplace/publicDestinationListings.ts")
		const hotelSearch = read("src/lib/search/publicSearchSurface.ts")
		const tourSearch = read("src/lib/tours/tourSearchSurface.ts")
		const tourPanel = read("src/components/searchPanel/TourSearchPanel.astro")
		const inventoryHold = read("src/pages/api/inventory/hold.ts")
		const privateTourRequest = read(
			"src/modules/catalog/infrastructure/repositories/TourTrustRepository.ts"
		)

		for (const source of [destinationListings, hotelSearch, tourSearch]) {
			expect(source).toContain("publicCatalogProductEligibility")
			expect(source).toContain("innerJoin(Provider")
		}
		expect(destinationListings).toContain('eq(ProductContent.dataClass, "production")')
		expect(destinationListings).toContain('eq(ProductStatus.state, "published")')
		expect(tourSearch).toContain('eq(ProductContent.dataClass, "production")')
		expect(tourSearch).toContain('eq(ProductCategory.dataClass, "production")')
		expect(tourPanel).toContain("eq(ProductCategory.isActive, true)")
		expect(tourPanel).toContain('eq(ProductCategory.dataClass, "production")')
		expect(inventoryHold).toContain("publicCatalogProductEligibility")
		expect(inventoryHold).toContain("innerJoin(Provider")
		expect(privateTourRequest).toContain('eq(ProductStatus.state, "published")')
	})

	it("migrates provenance and quarantines malformed or duplicate categories without deleting rows", () => {
		const migration = read("db/migrations/2026-08-26_marketplace_data_isolation.sql")
		for (const table of ["Product", "ProductCategory", "ProductContent"]) {
			expect(migration).toContain(`ALTER TABLE "${table}"`)
			expect(migration).toContain('"dataClass"')
		}
		expect(migration).toContain('"MarketplaceCatalogSanitationAudit"')
		expect(migration).toContain("uuid_slug")
		expect(migration).toContain("duplicate_name")
		expect(migration).not.toContain('DELETE FROM "ProductCategory"')
	})

	it("enforces provider eligibility and provenance inheritance at the database boundary", () => {
		const migration = read("db/migrations/2026-09-09_marketplace_public_provider_boundary.sql")
		const integrity = read("src/shared/infrastructure/db/schema/postgres-integrity.sql")
		const certification = read("src/scripts/certify-marketplace-commercialization.ts")
		const certificationEnvironment = read("src/scripts/marketplace-certification-environment.ts")

		for (const source of [migration, integrity]) {
			expect(source).toContain("fastt_enforce_marketplace_publication_boundary")
			expect(source).toContain("PUBLIC_PRODUCT_PROVIDER_NOT_ELIGIBLE")
			expect(source).toContain("PRODUCT_CONTENT_DATA_CLASS_MISMATCH")
		}
		expect(migration).toContain("SET \"dataClass\" = 'fixture'")
		expect(certification).toContain('accountPurpose: "commercial"')
		expect(certificationEnvironment).toContain(
			"MARKETPLACE_CERTIFICATION_APPLY_REQUIRES_ISOLATED_TEST_ENV"
		)
	})
})
