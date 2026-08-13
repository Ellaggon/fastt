import { readFileSync } from "node:fs"
import { expect, test } from "vitest"
const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")
test("fiscal operations exposes reports reconciliation and exports without silent truncation", () => {
	const page = read("src/pages/provider/settings/tax-fees/activity.astro")
	const reports = read("src/pages/api/provider/tax-fees/reports.ts")
	const reconciliation = read("src/pages/api/provider/tax-fees/reconciliation.ts")
	expect(page).toContain("?view=reports")
	expect(page).toContain("?view=reconciliation")
	expect(page).toContain("?view=exports")
	expect(reports).toContain("report_too_large")
	expect(reports).toContain("FiscalExportJob")
	expect(reconciliation).toContain("FiscalReconciliationCase")
})
