import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("public SEO and browser certification contract", () => {
	it("serves robots, sitemap and reusable structured data", () => {
		expect(read("src/pages/robots.txt.ts")).toContain("Sitemap:")
		const sitemap = read("src/pages/sitemap.xml.ts")
		expect(sitemap).toContain("ProductStatus")
		expect(sitemap).toContain("/destinos/")
		const layout = read("src/layouts/Layout.astro")
		expect(layout).toContain("PublicStructuredData")
		expect(read("src/components/seo/PublicStructuredData.astro")).toContain("application/ld+json")
		expect(
			read("db/migrations/2026-09-02_reclassify_historical_marketplace_fixtures.sql")
		).toContain("\"dataClass\" = 'fixture'")
		expect(read("src/pages/index.astro")).toContain('"@type": "WebSite"')
		expect(read("src/components/marketplace/MarketplaceDestinationResults.astro")).toContain(
			'"@type": "ItemList"'
		)
	})

	it("certifies a deterministic local preview when the HTML budget is mandatory", () => {
		const budget = read("scripts/perf/html-budget.mjs")
		expect(budget).toContain('FASTT_HTML_BUDGET_REQUIRED === "1"')
		const workflow = read(".github/workflows/architecture-guardrails.yml")
		expect(workflow).toContain("public-certification:")
		expect(workflow).toContain("Prepare isolated public catalog")
		expect(workflow).toContain("PLAYWRIGHT_PUBLIC_ROUTES")
		expect(workflow).toContain("/destinos/bolivia/la-paz-department/la-paz/tours")
		expect(workflow).not.toContain("/destinos/la-paz/tours")
		expect(workflow).toContain("test:marketplace:public-browser")
		expect(workflow).toContain("http://127.0.0.1:4178")
	})
})
