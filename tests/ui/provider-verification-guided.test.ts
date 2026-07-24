import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { buildRequiredKycSlots } from "@/lib/provider-documents"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S4-3 verification guided density", () => {
	it("adds business consequence copy per required slot", () => {
		const slots = buildRequiredKycSlots({ documents: [] })
		expect(slots).toHaveLength(3)
		for (const slot of slots) {
			expect(slot.consequence.length).toBeGreaterThan(20)
			expect(slot.uploadHref).toContain(`#kyc-slot-${slot.type}`)
		}
		expect(slots.find((slot) => slot.type === "tax_document")?.consequence).toContain(
			"liquidar cobros"
		)
		expect(slots.find((slot) => slot.type === "government_id")?.consequence).toMatch(
			/publicar|cumplimiento/i
		)
	})

	it("wires consequence, inline upload, and collapsed matrix/optionals", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")

		expect(view).toContain("data-verification-consequence")
		expect(view).toContain("Qué se bloquea")
		expect(view).toContain("data-verification-matrix")
		expect(view).toContain("<details")
		expect(view).toContain("Matriz de revisión (detalle)")

		expect(card).toContain("data-kyc-inline-upload-form")
		expect(card).toContain("data-kyc-slot-consequence")
		expect(card).toContain("data-kyc-consequence-banner")
		expect(card).toContain('name="type" value={slot.type}')
		expect(card).toContain("href={slot.uploadHref}")
		expect(card).toContain("allowUploadForm")
		expect(card).toContain("Hacer después")

		expect(page).toContain("data-verification-optionals")
		expect(page).toContain("Documentos opcionales")
		expect(page).toContain("focusType={requestedType}")
		expect(page).toContain("data-optional-upload-form")
		expect(page).toContain("Los mínimos se suben arriba")
	})
})
