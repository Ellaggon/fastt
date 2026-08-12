import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("the fiscal assignment workspace exposes a resolved hierarchy and bulk operations", () => {
	const matrix = read("src/components/tax-fees/FiscalAssignmentsMatrix.tsx")
	const tree = read("src/pages/api/provider/tax-fees/assignments/tree.ts")
	const bulk = read("src/pages/api/provider/tax-fees/assignments/bulk.ts")
	const migration = read("db/migrations/20260811_tax_fee_assignment_matrix.sql")

	expect(matrix).toContain("Mostrar heredadas")
	expect(matrix).toContain("Solo conflictos")
	expect(matrix).toContain("Cobertura")
	expect(matrix).toContain("Vista avanzada")
	expect(matrix).toContain("selectedScopeId")
	expect(matrix).toContain("scope: row.scope")
	expect(matrix).toContain('params.set("scope", selectedScopeId)')
	expect(matrix).toContain("Volver a herencia")
	expect(tree).toContain("resolveEffectiveTaxFeesUseCase")
	expect(tree).toContain("directAssignments")
	expect(tree).toContain("assignableDefinitions")
	expect(tree).toContain("jurisdictionJson")
	expect(tree).toContain("selectedScopeId")
	expect(tree).toContain("fiscal:assignment-tree")
	expect(bulk).toContain("db.transaction")
	expect(bulk).toContain("ensureOwned")
	expect(bulk).toContain('definition.editingState === "draft"')
	expect(bulk).toContain("definition.jurisdictionJson")
	expect(migration).toContain("TaxFeeAssignment_active_equivalent_unique")
})
