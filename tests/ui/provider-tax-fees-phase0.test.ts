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
		expect(page).toContain("showSettingsTabs={false}")
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

	it("keeps the creation flow stable and resolves scope through catalog resources", () => {
		const wizard = read("src/components/tax-fees/TaxFeeWizard.tsx")

		expect(wizard).not.toContain('if (props.initialMode === "creating")')
		expect(wizard).toContain("TaxFeeScopeResources")
		expect(wizard).toContain("Selecciona un producto")
		expect(wizard).toContain("Selecciona una unidad")
		expect(wizard).toContain("Selecciona una tarifa")
		expect(wizard).toContain("const productId = current.productId")
		expect(wizard).toContain("value={selectedVariantId}")
		expect(wizard).not.toContain("ID del alcance")
		expect(wizard).not.toContain("ID de producto para vista previa")
	})
})
