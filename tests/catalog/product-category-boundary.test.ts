import { readFileSync } from "node:fs"

import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { ProductCategory } from "@/shared/infrastructure/db/schema/tables"

describe("Product category boundaries", () => {
	it("scopes category identity by vertical", () => {
		const columns = Object.keys(getTableColumns(ProductCategory))
		expect(columns).toEqual(expect.arrayContaining(["vertical", "slug", "dataClass", "isActive"]))

		const schema = readFileSync("src/shared/infrastructure/db/schema/tables.ts", "utf8")
		expect(schema).toContain('uniqueIndex("ProductCategory_vertical_slug_unique").on(table.vertical, table.slug)')
		expect(schema).not.toContain('uniqueIndex("ProductCategory_slug_unique").on(table.slug)')
	})

	it("enforces vertical compatibility in both the database and write API", () => {
		const integrity = readFileSync("src/shared/infrastructure/db/schema/postgres-integrity.sql", "utf8")
		expect(integrity).toContain("fastt_validate_product_category_vertical")
		expect(integrity).toContain('"trg_ProductCategoryLink_vertical_match"')

		const endpoint = readFileSync("src/pages/api/catalog/product-categories.ts", "utf8")
		expect(endpoint).toContain("eq(ProductCategory.vertical, vertical)")
		expect(endpoint).toContain("await db.transaction")
		expect(endpoint).toContain('eq(ProductCategory.dataClass, "production")')
	})
})
