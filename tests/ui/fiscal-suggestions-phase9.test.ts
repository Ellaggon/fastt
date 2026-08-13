import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("jurisdiction suggestions require source evidence and human review", () => {
	const model = read(
		"src/modules/taxes-fees/application/use-cases/list-jurisdiction-tax-rule-suggestions.ts"
	)
	expect(model).toContain("sourceUrl")
	expect(model).toContain("consultedAt")
	expect(model).toContain("confidence")
	expect(read("src/components/tax-fees/FiscalReviewCenter.tsx")).toContain("Crear borrador")
	expect(read("src/components/tax-fees/FiscalReviewCenter.tsx")).toContain("Sugerencias")
	expect(read("src/pages/api/provider/tax-fees/suggestions.ts")).toContain("requiresSimulation")
})
