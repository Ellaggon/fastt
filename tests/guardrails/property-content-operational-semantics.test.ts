import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

const editorialSurfaces = [
	"src/pages/product/index.astro",
	"src/pages/product/[id]/index.astro",
	"src/pages/product/[id]/content.astro",
	"src/pages/product/[id]/images.astro",
	"src/pages/product/[id]/location.astro",
	"src/pages/product/[id]/subtype.astro",
]

describe("Guardrail: Property Content operational semantics", () => {
	it("keeps Property Content framed as catalog readiness instead of generic CRUD", () => {
		const requiredSignals: Record<string, string[]> = {
			"src/pages/product/index.astro": [
				"Catalog Readiness Hub",
				"Readiness ownership",
				"Catalog readiness",
				"Commercial readiness",
				"Inventory readiness",
			],
			"src/pages/product/[id]/index.astro": [
				"Property Content · Catalog Readiness",
				"Catalog readiness",
				"Sellability readiness context",
				"Commercial readiness",
				"Inventory readiness",
			],
			"src/pages/product/[id]/content.astro": [
				"Editorial Ownership",
				"Editorial Content",
				"Catalog readiness",
				"Commercial context",
				"Inventory context",
			],
			"src/pages/product/[id]/images.astro": [
				"Media Readiness",
				"Quality signal",
				"Not owned here",
			],
			"src/pages/product/[id]/location.astro": [
				"Location Readiness",
				"Discoverability",
				"Boundary",
			],
			"src/pages/product/[id]/subtype.astro": [
				"Metadata Readiness",
				"Catalog readiness",
				"Commercial context",
				"Physical context",
			],
		}

		const violations = Object.entries(requiredSignals).flatMap(([relativePath, signals]) => {
			const source = read(relativePath)
			return signals.flatMap((signal) =>
				source.includes(signal) ? [] : [`${relativePath}: missing "${signal}"`]
			)
		})

		expect(
			violations,
			`Property Content surfaces must communicate editorial/catalog ownership and readiness boundaries:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("prevents editorial catalog pages from owning pricing or inventory runtime", () => {
		const forbiddenRuntimePatterns = [
			/\/api\/pricing\//,
			/\/api\/inventory\//,
			/\/pricing\/bulk/,
			/\/inventory\/bulk/,
			/ratePlanId/,
			/RatePlan/,
			/EffectivePricing/,
			/DailyInventory/,
			/EffectiveAvailability/,
		]

		const violations = editorialSurfaces.flatMap((relativePath) => {
			const source = read(relativePath)
			return forbiddenRuntimePatterns.flatMap((pattern) =>
				pattern.test(source) ? [`${relativePath}: forbidden operational ownership ${pattern}`] : []
			)
		})

		expect(
			violations,
			`Property Content may show contextual sellability signals, but must not own pricing/inventory runtime:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps physical variant surfaces from reverting to variant-pricing language", () => {
		const files = [
			"src/pages/product/[id]/variants.astro",
			"src/pages/product/[id]/variants/[variantId].astro",
			"src/pages/product/[id]/variants/new.astro",
			"src/pages/product/[id]/variants/[variantId]/availability.astro",
		]
		const bannedCopy = [/Precios/, /Sin pricing configurado/, /pricing por variante/i]

		const violations = files.flatMap((relativePath) => {
			const source = read(relativePath)
			return bannedCopy.flatMap((pattern) =>
				pattern.test(source) ? [`${relativePath}: banned variant-pricing language ${pattern}`] : []
			)
		})

		expect(
			violations,
			`Variant surfaces must keep commercial coverage contextual and never revive variant-pricing language:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps Property Content navigation honest about planned maturity", () => {
		const governance = read("src/lib/backoffice-governance.ts")

		expect(governance).toContain("Catalog Readiness")
		expect(governance).toContain("Media Quality Review")
		expect(governance).toContain("SEO Metadata")
		expect(governance).toContain("Content Quality Workflow")
		expect(governance).toContain("Commercial and inventory readiness remain contextual signals")
		expect(governance).not.toContain("Property Content NO")
	})
})
