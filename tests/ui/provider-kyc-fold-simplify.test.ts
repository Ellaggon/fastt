import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("KYC fold simplify (elevated one composition)", () => {
	it("elevated card uses focus doc title without Negocio/0/3/example strip", () => {
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		expect(card).toContain("data-kyc-elevated-title")
		expect(card).toContain("elevated && focusSlot")
		expect(card).not.toContain("data-kyc-empty-example")
		// Badges 0/3 only in non-elevated branch
		expect(card).toMatch(/elevated && focusSlot[\s\S]*?Documentos mínimos/)
	})

	it("coach defaults collapsed with a single example marker", () => {
		const coach = read("src/components/provider/ProviderKycCaptureCoach.astro")
		expect(coach).toContain("data-kyc-capture-collapsed")
		expect(coach).toContain("<details")
		expect(coach).toContain("Consejos de captura")
		expect(coach).toContain("data-kyc-capture-example")
	})

	it("form opens dropzone+submit; notes optional details", () => {
		const form = read("src/components/provider/ProviderKycUploadForm.astro")
		const fileIdx = form.indexOf("<ProviderKycFileField")
		const submitIdx = form.indexOf('data-kyc-submit')
		const notesIdx = form.indexOf("data-kyc-submission-notes")
		const coachIdx = form.indexOf("<ProviderKycCaptureCoach")
		expect(fileIdx).toBeGreaterThan(-1)
		expect(submitIdx).toBeGreaterThan(fileIdx)
		expect(notesIdx).toBeGreaterThan(submitIdx)
		expect(coachIdx).toBeGreaterThan(notesIdx)
	})

	it("rail stays quiet without badge chrome", () => {
		const rail = read("src/components/provider/ProviderTrustMapRail.astro")
		expect(rail).toContain('data-trust-map-quiet="true"')
		expect(rail).toContain('data-trust-map-on-light="true"')
		expect(rail).not.toContain("sr-only")
		expect(rail).not.toContain("En foco")
	})
})
