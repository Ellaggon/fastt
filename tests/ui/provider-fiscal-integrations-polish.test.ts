import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { listProviderConnectorCatalog } from "@/lib/provider-integrations"
import { readVerificationSurface } from "./read-verification-surface"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S4-6 fiscal withhold explainer + Pro docs-lite", () => {
	it("exposes docs-lite help for every connector in the catalog", () => {
		const catalog = listProviderConnectorCatalog()
		expect(catalog.length).toBeGreaterThanOrEqual(4)
		for (const item of catalog) {
			expect(item.docsLite.title.length).toBeGreaterThan(8)
			expect(item.docsLite.steps.length).toBeGreaterThan(0)
		}
		expect(catalog.some((item) => String(item.key) === "payment_gateway")).toBe(false)
	})

	it("wires withhold explainer on fiscal identity and docs-lite in Simple+Pro integrations", () => {
		const identity = readVerificationSurface("src/pages/provider/settings/verification/fiscal.astro")
		const taxCard = read("src/components/provider/ProviderTaxProfileCard.astro")
		const integrations = read(
			"src/pages/provider/settings/integrations/connect/channel-manager.astro"
		)

		expect(identity).not.toContain("Ir a cuentas de liquidación")
		expect(identity).not.toContain("Resumen fiscal</Button>")
		expect(identity).toContain("ProviderTaxProfileCard")
		expect(taxCard).toContain("data-fiscal-withhold-explainer")
		expect(taxCard).toContain('data-long-copy-collapsed="true"')
		expect(taxCard).toContain("Retenciones y liquidaciones")
		expect(taxCard).toContain("retener o retrasar")
		expect(taxCard).toContain("retener o retrasar liquidaciones")
		expect(taxCard).toContain("data-fiscal-action-lead")
		expect(taxCard).toContain("Aquí debes completar")
		expect(taxCard).toContain('data-fiscal-long-copy-collapsed="true"')

		expect(integrations).toContain('data-channel-wizard-step="provider"')
		expect(integrations).toContain('data-channel-wizard-step="access"')
		expect(integrations).toContain("Selecciona el sistema")
		expect(integrations).toContain("Autorizar acceso")
	})
})
