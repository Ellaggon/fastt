import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S2-1 fiscal UX split TIN vs guest taxes", () => {
	it("exposes identity and sales routes plus domain tabs", () => {
		const routes = read("src/lib/routes.ts")
		const tabs = read("src/components/provider/ProviderFiscalDomainTabs.astro")
		const hub = read("src/pages/provider/settings/tax-fees/index.astro")
		const identity = read("src/pages/provider/settings/tax-fees/identity.astro")
		const sales = read("src/pages/provider/settings/tax-fees/sales.astro")
		const api = read("src/pages/api/provider/settings/tax-configuration.ts")
		const governance = read("src/lib/provider-governance.ts")

		expect(routes).toContain('providerSettingsTaxIdentity: () => "/provider/settings/tax-fees/identity"')
		expect(routes).toContain('providerSettingsTaxSales: () => "/provider/settings/tax-fees/sales"')

		expect(tabs).toContain("Tu registro fiscal")
		expect(tabs).toContain("Impuestos al huésped")
		expect(tabs).toContain("providerSettingsTaxIdentity")
		expect(tabs).toContain("providerSettingsTaxSales")

		expect(hub).toContain("ProviderFiscalDomainTabs")
		expect(hub).toContain("Dos cosas distintas")
		expect(hub).toContain("Abrir registro fiscal")
		expect(hub).toContain("Abrir impuestos al huésped")
		expect(hub).toContain("providerSettingsTaxSales()}?create=1")
		expect(hub).not.toContain("TaxFeePage")
		expect(hub).not.toContain("ProviderTaxProfileCard")

		expect(identity).toContain("ProviderTaxProfileCard")
		expect(identity).toContain('active="identity"')
		expect(identity).not.toContain("TaxFeePage")
		expect(identity).toContain("Guardamos tu registro fiscal")

		expect(sales).toContain("TaxFeePage")
		expect(sales).toContain('active="sales"')
		expect(sales).not.toContain("ProviderTaxProfileCard")
		expect(sales).toContain("Solo precios de reserva")

		expect(api).toContain("/provider/settings/tax-fees/identity?result=")
		expect(governance).toContain("taxFeesIdentity")
		expect(governance).toContain("taxFeesSales")
		expect(governance).toContain("href: settingsRoutes.taxFeesIdentity")
		expect(governance).toContain("href: settingsRoutes.taxFeesSales")
	})
})
