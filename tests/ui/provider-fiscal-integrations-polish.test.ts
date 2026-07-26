import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { listProviderConnectorCatalog } from "@/lib/provider-integrations"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S4-6 fiscal withhold explainer + Pro docs-lite", () => {
	it("exposes docs-lite help for every connector in the catalog", () => {
		const catalog = listProviderConnectorCatalog()
		expect(catalog.length).toBeGreaterThanOrEqual(5)
		for (const item of catalog) {
			expect(item.docsLite.title.length).toBeGreaterThan(8)
			expect(item.docsLite.steps.length).toBeGreaterThan(0)
		}
		expect(catalog.find((item) => item.key === "payment_gateway")?.docsLite.title).toContain(
			"pasarela"
		)
	})

	it("wires withhold explainer on fiscal identity and docs-lite in Simple+Pro integrations", () => {
		const identity = read("src/pages/provider/settings/verification/fiscal.astro")
		const taxCard = read("src/components/provider/ProviderTaxProfileCard.astro")
		const integrations = read("src/pages/provider/settings/integrations.astro")

		expect(identity).toContain("data-fiscal-withhold-explainer")
		expect(identity).toContain('data-long-copy-collapsed="true"')
		expect(identity).toContain("<details")
		expect(identity).toContain("Retenciones y liquidaciones")
		expect(identity).toContain("retener o retrasar")
		expect(identity).not.toContain("Ir a cuentas de liquidación")
		expect(identity).not.toContain("Resumen fiscal</Button>")
		expect(identity).toContain("retener o retrasar liquidaciones")
		expect(taxCard).toContain('data-fiscal-long-copy-collapsed="true"')

		expect(integrations).toContain("data-connector-docs-lite")
		expect(integrations).toContain("data-connector-scopes")
		expect(integrations).toContain("connector.docsLite.title")
		// S7-2: docs-lite available in Simple (not Pro-only)
		expect(integrations).not.toMatch(
			/\{!isSimple \? \(\s*<details[^>]*data-connector-docs-lite/
		)
		expect(integrations).toContain("data-integrations-pro-notice")
		expect(integrations).toContain("Modo Pro · catálogo + ayuda por conector")
	})
})
