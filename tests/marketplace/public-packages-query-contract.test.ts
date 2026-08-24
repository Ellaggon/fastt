import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const packagesPage = readFileSync(
	join(process.cwd(), "src/pages/packages/index.astro"),
	"utf8"
)

describe("Public packages query contract", () => {
	it("uses the single canonical discovery place without an invalid aggregate grouping", () => {
		expect(packagesPage).toContain('eq(ProductGeoPlace.role, "primary_discovery")')
		expect(packagesPage).toContain("eq(ProductGeoPlace.isPrimary, true)")
		expect(packagesPage).not.toContain(".groupBy(Product.id)")
	})

	it("quotes the PascalCase image table in its correlated image query", () => {
		expect(packagesPage).toContain('FROM "Image"')
	})
})
