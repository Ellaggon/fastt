import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S2-1 fiscal UX split TIN vs guest taxes", () => {
	it("keeps guest charges in their own workspace and fiscal identity in verification", () => {
		const routes = read("src/lib/routes.ts")
		const hub = read("src/pages/provider/settings/tax-fees/index.astro")
		const identity = read("src/pages/provider/settings/tax-fees/identity.astro")
		const sales = read("src/pages/provider/settings/tax-fees/sales.astro")
		const api = read("src/pages/api/provider/settings/tax-configuration.ts")
		const governance = read("src/lib/provider-governance.ts")

		expect(routes).toContain(
			'providerSettingsVerificationFiscal: () => "/provider/settings/verification/fiscal"'
		)
		expect(routes).toContain(
			'providerSettingsTaxIdentity: () => "/provider/settings/tax-fees/identity"'
		)
		expect(routes).toContain('providerSettingsTaxSales: () => "/provider/settings/tax-fees/sales"')

		expect(hub).toContain("TaxFeePage")
		expect(hub).toContain("Impuestos y cargos")
		expect(hub).toContain("showSettingsTabs={false}")
		expect(hub).toContain("getProviderTaxConfiguration")
		expect(hub).toContain("initialResources")
		expect(hub).not.toContain("Solo precios de reserva")
		expect(hub).toContain("providerSettingsVerificationFiscal")
		expect(hub).not.toContain("ProviderFiscalDomainTabs")
		expect(hub).not.toContain("Dos cosas distintas")
		expect(hub).not.toContain("Abrir registro fiscal")
		expect(hub).not.toContain("ProviderTaxProfileCard")

		expect(identity).toContain("Astro.redirect(routes.providerSettingsVerificationFiscal())")
		expect(identity).not.toContain("TaxFeePage")
		expect(identity).not.toContain("ProviderTaxProfileCard")

		expect(sales).toContain("Astro.redirect")
		expect(sales).toContain("providerSettingsTaxFees")
		expect(sales).not.toContain("TaxFeePage")
		expect(sales).not.toContain("ProviderTaxProfileCard")

		expect(api).toContain("/provider/settings/verification/fiscal?result=")
		expect(governance).toContain("taxFeesIdentity")
		expect(governance).toContain("taxFeesSales")
		expect(governance).toContain('taxFeesIdentity: "/provider/settings/verification/fiscal"')
		expect(governance).toContain('taxFeesSales: "/provider/settings/tax-fees"')
	})
})
