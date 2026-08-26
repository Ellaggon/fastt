import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { canonicalDatabaseTableNames } from "@/shared/infrastructure/db/schema/canonical-schema"
import { ProductOperationalSurface } from "@/shared/infrastructure/db/schema/tables"

describe("Product operational projection schema", () => {
	it("keeps preparation and operational facts in one canonical projection", () => {
		const columns = Object.keys(getTableColumns(ProductOperationalSurface)).sort()

		expect(columns).toEqual(
			expect.arrayContaining([
				"productId",
				"providerId",
				"status",
				"preparationStatusLabel",
				"preparationStatusVariant",
				"isPublished",
				"readinessPercent",
				"blockerCount",
				"blockerPreviewJson",
				"readyToPublish",
				"continuePreparationHref",
				"previewHref",
				"preparationUpdatedAt",
				"variantCount",
				"activeVariantCount",
			])
		)
		expect(columns).not.toContain("readinessJson")
	})

	it("does not reintroduce the retired preparation snapshot table", () => {
		expect(canonicalDatabaseTableNames()).not.toContain("ProductPreparationSnapshot")
	})
})
