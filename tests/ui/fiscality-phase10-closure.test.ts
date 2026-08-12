import { readFileSync } from "node:fs"
import { expect, test } from "vitest"
const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")
test("fiscality closure retains migration, redirects and certification evidence", () => {
	const migration = read("db/migrations/20260811_fiscality_closure.sql")
	expect(migration).toContain("TaxFeeDefinitionVersion")
	expect(migration).toContain("currentVersionId")
	expect(migration).toContain("jurisdictionJson")
	expect(read("src/pages/provider/settings/tax-fees/identity.astro")).toContain("providerSettingsVerificationFiscal")
	expect(read("src/pages/provider/settings/tax-fees/sales.astro")).toContain("providerSettingsTaxFees")
	expect(read("src/pages/provider/settings/tax-fees/reports.astro")).toContain("providerSettingsTaxActivity")
	expect(read("docs/fiscality/phase-10-certification.md")).toContain("Draft -> simulate -> publish -> assign")
})
