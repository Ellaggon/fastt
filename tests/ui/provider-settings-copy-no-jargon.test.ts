import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

/** User-visible template/copy only (ignore Astro frontmatter / imports). */
function visibleCopy(source: string) {
	return source.replace(/^---[\s\S]*?---\s*/m, "")
}

const forbiddenJargon = [
	"ProviderTaxConfiguration",
	"TaxFeeDefinition",
	"TaxFeeAssignment",
	"vault://",
	"override interno",
	"smoke test",
	"Smoke test",
	"`r2:",
	"`local://",
	"taxpayer",
	"occupancy taxes",
	"Expedia connectivity",
	"Airbnb/Expedia-style",
]

describe("S0-3 provider settings copy without schema jargon", () => {
	it("keeps tax, payments and integrations notices host-facing", () => {
		const sources = [
			read("src/pages/provider/settings/tax-fees/index.astro"),
			read("src/pages/provider/settings/verification/fiscal.astro"),
			read("src/pages/provider/settings/verification/payments.astro"),
			read("src/pages/provider/settings/integrations.astro"),
			read("src/pages/provider/settings/verification.astro"),
			read("src/components/provider/ProviderTaxProfileCard.astro"),
			read("src/components/provider/ProviderPaymentAccountsCard.astro"),
		].map(visibleCopy)

		for (const source of sources) {
			for (const jargon of forbiddenJargon) {
				expect(source, `found jargon: ${jargon}`).not.toContain(jargon)
			}
		}

		expect(sources[0]).toContain("Solo precios de reserva")
		expect(sources[1]).toContain("Guardamos tu registro fiscal")
		expect(sources[6]).toContain("envía → espera depósitos")
		expect(sources[6]).toContain("Confirmar montos")
		expect(sources[6]).toContain("Una cuenta primero")
		expect(sources[6]).toContain("Cómo confirmar los micro-depósitos")
		expect(sources[3]).toContain("Probar conexión")
		expect(sources[3]).toContain("Modo Pro · catálogo + ayuda por conector")
		expect(sources[3]).toContain("data-connector-docs-lite")
		expect(sources[1]).toContain("Retenciones y liquidaciones")
	})
})
