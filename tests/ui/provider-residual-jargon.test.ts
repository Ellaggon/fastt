import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function visibleCopy(source: string) {
	return source.replace(/^---[\s\S]*?---\s*/m, "")
}

const residualJargon = [
	"Readiness",
	"Checklist KYC",
	"documentos KYC",
	"Documentos KYC",
	"canónicos",
	"canónicas",
	"canónico",
	"Verificar (override)",
	"override admin",
	"ProviderFinancialProfile",
	"ownership bancario",
	"Centro de control",
	"readiness derivado",
	"Referencia segura de acceso",
]

describe("S3-1 residual product jargon cleaned", () => {
	it("removes Readiness / KYC / canónicos / override from host and admin copy", () => {
		const sources = [
			read("src/pages/provider/settings/index.astro"),
			read("src/pages/provider/settings/profile.astro"),
			read("src/components/provider/ProviderProfileForm.astro"),
			read("src/components/provider/ProviderKycSlotsCard.astro"),
			read("src/pages/provider/settings/integrations.astro"),
			read("src/pages/admin/providers.astro"),
		]
		const visible = sources.map(visibleCopy)

		for (const source of visible) {
			for (const jargon of residualJargon) {
				expect(source, `found residual jargon: ${jargon}`).not.toContain(jargon)
			}
		}

		expect(visible[0]).toContain("Estado de tu cuenta")
		expect(visible[0]).toContain("estado de tu cuenta")
		expect(visible[1]).toContain("sus propias secciones")
		expect(visible[2]).toContain("documentos mínimos de cumplimiento")
		expect(visible[3]).toContain("Documentos mínimos")
		expect(visible[3]).not.toContain("Checklist KYC")
		expect(visible[4]).toContain("Enlace o referencia de acceso")
		expect(visible[5]).toContain("Verificar manualmente")
		expect(visible[5]).toContain("Documentos de cumplimiento")
	})
})
