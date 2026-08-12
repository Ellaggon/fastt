import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("the fiscal simulator certifies a PriceQuote without mutating fiscal data", () => {
	const simulator = read("src/components/tax-fees/FiscalSimulator.tsx")
	const preview = read("src/pages/api/provider/tax-fees/preview.ts")
	const quote = read("src/modules/pricing/domain/price-quote.ts")

	expect(simulator).toContain("Comparar contra publicada")
	expect(simulator).toContain("Vista técnica")
	expect(simulator).toContain("Exportar")
	expect(preview).toContain("buildPriceQuote")
	expect(preview).toContain('source: "simulation"')
	expect(preview).toContain("status: \"active\"")
	expect(quote).toContain('"simulation"')
})
