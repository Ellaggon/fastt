import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	commercialLineForOnboardingVertical,
	commercialLinesForProductTypes,
	commercialLineForProductType,
	commercialLineFromOnboardingDestination,
	collectionModelForCommercialLine,
	linesAfterRemovingProducts,
	sortCommercialLines,
	type CommercialLineRecord,
} from "@/lib/verification/commercial-lines"

describe("provider commercial lines", () => {
	it("reads a tour catalog as the tour line even before the line table is filled", () => {
		expect(commercialLinesForProductTypes(["tour", "tour"])).toEqual(["tour"])
		expect(commercialLinesForProductTypes(["hotel", "tour"])).toEqual(["lodging", "tour"])
		expect(commercialLinesForProductTypes(["package"])).toEqual([])
	})

	it("maps lodging and tours, and leaves package and limousine without a line", () => {
		expect(commercialLineForProductType("hotel")).toBe("lodging")
		expect(commercialLineForProductType("whole_home")).toBe("lodging")
		expect(commercialLineForProductType("rental")).toBe("lodging")
		expect(commercialLineForProductType("Tour")).toBe("tour")
		for (const line of ["package", "limousine"]) {
			expect(commercialLineForProductType(line)).toBeNull()
		}
		expect(commercialLineForOnboardingVertical("hotel")).toBe("lodging")
		expect(commercialLineForOnboardingVertical("alojamiento")).toBe("lodging")
		expect(commercialLineForOnboardingVertical("tour")).toBe("tour")
	})

	it("reads the line from the onboarding destination, not from a cookie", () => {
		expect(
			commercialLineFromOnboardingDestination("/provider/onboarding/business?vertical=tour")
		).toBe("tour")
		expect(
			commercialLineFromOnboardingDestination(
				"/product/create?playbook=launch&step=create&flow=create"
			)
		).toBe("lodging")
		expect(commercialLineFromOnboardingDestination("/provider/settings/profile")).toBeNull()
	})

	it("keeps the enrolled lines after the last product is removed", () => {
		const enrolled = [
			{ line: "lodging" as const, originProductId: "hotel-1" },
			{ line: "tour" as const, originProductId: "tour-1" },
		]
		expect(linesAfterRemovingProducts(enrolled)).toEqual(enrolled)
		expect(sortCommercialLines(["tour", "lodging"])).toEqual(["lodging", "tour"])
		const migration = readFileSync("db/migrations/2026-11-07_provider_commercial_line.sql", "utf8")
		expect(migration).toContain("ON DELETE SET NULL")
		expect(migration).not.toContain('DELETE FROM "ProviderCommercialLine"')
		const baseline = readFileSync("db/postgres/0001_initial_schema.sql", "utf8")
		expect(baseline).toContain("ON DELETE SET NULL")
		expect(baseline).toContain('"ProviderCommercialLine"')
	})

	it("does not let line enrollment change hotel publication", () => {
		const publish = readFileSync("src/pages/api/product/publish.ts", "utf8")
		const governance = readFileSync("src/lib/provider-governance.ts", "utf8")
		const removal = readFileSync(
			"src/modules/catalog/infrastructure/repositories/ProductRepository.ts",
			"utf8"
		)
		expect(publish).not.toContain("commercial-lines")
		expect(governance).not.toContain("commercial-lines")
		expect(removal).not.toContain("ProviderCommercialLine")
	})

	it("keeps collection declarations independent for a mixed provider", () => {
		const lines = [
			{
				line: "lodging" as const,
				collectionModel: "platform_collect" as const,
			},
			{
				line: "tour" as const,
				collectionModel: "property_collect" as const,
			},
		]
		const mixedLines = lines as unknown as CommercialLineRecord[]
		expect(collectionModelForCommercialLine(mixedLines, "lodging")).toBe("platform_collect")
		expect(collectionModelForCommercialLine(mixedLines, "tour")).toBe("property_collect")
		expect(collectionModelForCommercialLine(mixedLines, null)).toBe("undecided")
	})

	it("does not copy the former account declaration into either commercial line", () => {
		const migration = readFileSync(
			"db/migrations/2026-11-10_provider_commercial_line_collection_model.sql",
			"utf8"
		)
		expect(migration).toContain("Existing")
		expect(migration).toContain("intentionally not copied")
		expect(migration).toContain("DEFAULT 'undecided'")
		expect(migration).not.toMatch(/update\s+"ProviderCommercialLine"/i)
	})
})
