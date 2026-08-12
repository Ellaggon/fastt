import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

test("Fase 2 exposes operational fiscal controls instead of a definitions-only surface", () => {
	const definitionsApi = read("src/pages/api/provider/tax-fees/definitions.ts")
	const assignmentsApi = read("src/pages/api/provider/tax-fees/assignments.ts")
	const previewApi = read("src/pages/api/provider/tax-fees/preview.ts")
	const page = read("src/components/tax-fees/TaxFeePage.tsx")
	const wizard = read("src/components/tax-fees/TaxFeeWizard.tsx")

	expect(definitionsApi).toContain("operationalStatus")
	expect(definitionsApi).toContain("revision")
	expect(definitionsApi).toContain("writeProviderAuditLog")
	expect(assignmentsApi).toContain("export const PUT")
	expect(assignmentsApi).toContain("tax_fee_assignment_paused")
	expect(previewApi).toContain("taxFeeDefinitionId")
	expect(previewApi).toContain("previewedDefinitionId")
	expect(page).toContain("Pausar")
	expect(page).toContain("Archivar")
	expect(page).toContain("Revisión")
	expect(wizard).toContain("La simulación usa el cálculo real")
})
