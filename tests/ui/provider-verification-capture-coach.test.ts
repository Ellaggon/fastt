import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	buildRequiredKycSlots,
	kycCaptureExampleByType,
	kycCaptureSharedTips,
	resolveKycUploadFocusType,
} from "@/lib/provider-documents"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S5-3 verification capture coach", () => {
	it("resolves a single upload focus: ?type → rejected → missing", () => {
		const slots = [
			{ type: "government_id", state: "missing" },
			{ type: "business_registration", state: "rejected" },
			{ type: "tax_document", state: "missing" },
		]
		expect(resolveKycUploadFocusType({ slots })).toBe("business_registration")
		expect(resolveKycUploadFocusType({ slots, focusType: "tax_document" })).toBe("tax_document")
		expect(resolveKycUploadFocusType({ slots, focusType: "government_id" })).toBe("government_id")
		expect(
			resolveKycUploadFocusType({
				slots: [
					{ type: "government_id", state: "verified" },
					{ type: "business_registration", state: "pending" },
					{ type: "tax_document", state: "verified" },
				],
			})
		).toBeNull()
	})

	it("exposes shared tips and per-type examples on slots", () => {
		const slots = buildRequiredKycSlots({ documents: [] })
		expect(kycCaptureSharedTips.length).toBeGreaterThanOrEqual(3)
		expect(kycCaptureSharedTips.some((tip) => /bordes/i.test(tip))).toBe(true)
		expect(kycCaptureSharedTips.some((tip) => /nítid/i.test(tip))).toBe(true)
		for (const slot of slots) {
			expect(slot.captureExample).toBe(kycCaptureExampleByType[slot.type])
			expect(slot.captureExample).toMatch(/Ejemplo:/)
		}
	})

	it("wires capture coach notice and one-doc focus in KYC slots card", () => {
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const page = read("src/pages/provider/settings/verification.astro")

		expect(card).toContain("resolveKycUploadFocusType")
		expect(card).toContain("focusTypeResolved")
		expect(card).toContain("data-kyc-one-doc-focus")
		expect(card).toContain("data-kyc-slot-focus")
		expect(card).toContain("data-kyc-capture-coach")
		expect(card).toContain("data-kyc-capture-example")
		expect(card).toContain("Cómo preparar el documento")
		expect(card).toContain("kycCaptureSharedTips")
		expect(card).toContain("preferOpen = isFocused && allowUploadForm(slot)")
		expect(card).not.toContain("focus ? focus === slot.type : slot.state !== \"verified\"")
		expect(card).not.toMatch(/Persona|Jumio|Onfido/i)

		expect(page).toContain("focusType={requestedType}")
		expect(page).toContain("Un próximo documento a la vez")
	})
})

describe("S6-3 KYC hard one-doc focus", () => {
	it("mounts upload form only for the focused slot; others get defer CTA", () => {
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")

		expect(card).toContain("allowUploadForm")
		expect(card).toContain("data-kyc-hard-one-doc")
		expect(card).toContain("data-kyc-slot-defer")
		expect(card).toContain("data-kyc-slot-defer-cta")
		expect(card).toContain("Hacer después")
		expect(card).toContain("deferUpload")
		expect(card).toContain("{allowUploadForm(slot) ? (")
		expect(card).toContain("solo el foco de abajo muestra el envío")
		expect(card).not.toContain("{showInlineUpload(slot) ? (")
		expect(card).not.toContain("Los demás quedan plegados hasta que termines este")
	})

	it("keeps resolveKycUploadFocusType as the single focus source", () => {
		const slots = [
			{ type: "government_id", state: "missing" },
			{ type: "business_registration", state: "missing" },
			{ type: "tax_document", state: "rejected" },
		]
		expect(resolveKycUploadFocusType({ slots })).toBe("tax_document")
		expect(resolveKycUploadFocusType({ slots, focusType: "government_id" })).toBe("government_id")
	})
})
