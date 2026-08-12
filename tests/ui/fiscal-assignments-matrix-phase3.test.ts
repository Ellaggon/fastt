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
	expect(matrix).toContain("Volver a herencia")
	expect(tree).toContain("resolveEffectiveTaxFeesUseCase")
	expect(tree).toContain("directAssignments")
	expect(bulk).toContain("db.transaction")
	expect(bulk).toContain("ensureOwned")
	expect(migration).toContain("TaxFeeAssignment_active_equivalent_unique")
})
