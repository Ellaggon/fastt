import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("Fase 2 delivers a searchable fiscal definition catalogue and rule detail", () => {
	const page = read("src/components/tax-fees/TaxFeePage.tsx")

	expect(page).toContain("Buscar por nombre o código")
	expect(page).toContain("Todos los estados")
	expect(page).toContain("Jurisdicción")
	expect(page).toContain("Base imponible")
	expect(page).toContain("Detalle de regla")
	expect(page).toContain("Duplicar")
	expect(page).toContain("Asignaciones y canales")
	expect(page).toContain("Versión y actividad")
	expect(page).toContain("simulation-certification?definitionId")
	expect(page).toContain("Comprobar en Simulador")
	expect(page).toContain("Revisar y publicar")
})

test("Fase 2 separates draft editing from immutable publication versions", () => {
	const schema = read("src/shared/infrastructure/db/schema/tables.ts")
	const api = read("src/pages/api/provider/tax-fees/definitions.ts")
	const wizard = read("src/components/tax-fees/TaxFeeWizard.tsx")
	const migration = read("db/migrations/20260811_tax_fee_definition_versions.sql")

	expect(schema).toContain("TaxFeeDefinitionVersion")
	expect(schema).toContain("editingState")
	expect(schema).toContain("currentVersionId")
	expect(api).toContain("publishTaxFeeDefinitionVersion")
	expect(api).toContain('publicationMode: z.enum(["draft", "publish", "schedule"])')
	expect(wizard).toContain('persistDefinition("draft")')
	expect(wizard).toContain("void persistDefinition(intent)")
	expect(wizard).toContain("Comprobar en Simulador")
	expect(wizard).not.toContain('fetch("/api/provider/tax-fees/assignments", {')
	expect(migration).toContain('CREATE TABLE IF NOT EXISTS "TaxFeeDefinitionVersion"')
})
