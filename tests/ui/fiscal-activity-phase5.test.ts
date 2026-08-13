import { readFileSync } from "node:fs"
import { expect, test } from "vitest"
const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")
test("fiscal activity is append-only, correlated and filterable", () => {
	expect(read("src/shared/infrastructure/db/schema/tables.ts")).toContain("FiscalActivityEvent")
	expect(read("src/shared/infrastructure/db/schema/tables.ts")).toContain("FiscalExportJob")
	expect(read("src/pages/api/provider/tax-fees/activity.ts")).toContain("ProviderAuditLog")
	expect(read("src/components/tax-fees/FiscalActivity.tsx")).toContain("Ver diferencias")
	expect(read("src/lib/taxes-fees/fiscal-activity.ts")).toContain("correlationId")
})
