import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("Fase 3 keeps advanced fiscal rules structured, calculated and quoted", () => {
	const wizard = read("src/components/tax-fees/TaxFeeWizard.tsx")
	const definitions = read("src/pages/api/provider/tax-fees/definitions.ts")
	const calculator = read("src/modules/taxes-fees/application/use-cases/compute-tax-breakdown.ts")
	const quote = read("src/modules/pricing/domain/price-quote.ts")

	expect(wizard).toContain("¿Quién cobrará este importe?")
	expect(wizard).toContain("Limitar las noches cobrables")
	expect(wizard).toContain("Excluir huéspedes según su país de residencia")
	expect(wizard).toContain("Cambiar el importe durante una temporada")
	expect(wizard).toContain("applicationPeriod")
	expect(definitions).toContain("jurisdictionSchema")
	expect(calculator).toContain("exemptGuestResidenceCountries")
	expect(calculator).toContain("maxNights")
	expect(calculator).toContain("collectionResponsibility")
	expect(quote).toContain("collectionResponsibility")
})
