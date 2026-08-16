import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("Fiscalidad Fase 0", () => {
	it("keeps Fiscalidad outside the general settings tabs", () => {
		const subnav = read("src/components/provider/ProviderSettingsSubnav.astro")
		const page = read("src/pages/provider/settings/tax-fees/index.astro")

		expect(subnav).not.toContain('label: "Fiscalidad"')
		expect(page).toContain("FiscalWorkspaceLayout")
		expect(page).not.toContain("ProviderSettingsLayout")
	})

	it("uses live fiscal status and enforces read-only access in the workspace", () => {
		const page = read("src/pages/provider/settings/tax-fees/index.astro")
		const taxPage = read("src/components/tax-fees/TaxFeePage.tsx")
		const definitionsApi = read("src/pages/api/provider/tax-fees/definitions.ts")
		const assignmentsApi = read("src/pages/api/provider/tax-fees/assignments.ts")

		expect(page).toContain("getProviderTaxConfiguration")
		expect(page).toContain("canManageFiscality")
		expect(taxPage).toContain("props.canManageFiscality")
		expect(definitionsApi).toContain("requireProviderFiscalityManager")
		expect(assignmentsApi).toContain("requireProviderFiscalityManager")
	})

	it("keeps creation separate from commercial scope selection", () => {
		const wizard = read("src/components/tax-fees/TaxFeeWizard.tsx")

		expect(wizard).toContain("TaxFeeScopeResources")
		expect(wizard).toContain("El alcance comercial se define después")
		expect(wizard).toContain("Guardar esta definición no la aplica a ninguna venta")
		expect(wizard).toContain("Comprobar en Simulador")
		expect(wizard).not.toContain("ID del alcance")
		expect(wizard).not.toContain("ID de producto para vista previa")
	})
})
