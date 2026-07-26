import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	getKycCaptureGuide,
	kycCaptureExampleByType,
	kycCaptureGuideByType,
	kycCaptureSharedTips,
	requiredKycDocumentTypes,
} from "@/lib/provider-documents"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("V2 KYC capture polish (tips + mobile file UX)", () => {
	it("defines per-type visual tips, frame, example and mobile hint", () => {
		for (const type of requiredKycDocumentTypes) {
			const guide = kycCaptureGuideByType[type]
			expect(guide.tips.length).toBeGreaterThanOrEqual(3)
			expect(guide.example).toMatch(/Ejemplo:/)
			expect(guide.example).toBe(kycCaptureExampleByType[type])
			expect(guide.mobileHint.length).toBeGreaterThan(20)
			expect(guide.frameKind).toBeTruthy()
			expect(guide.acceptHint).toMatch(/12 MB/)
		}
		expect(getKycCaptureGuide("government_id").frameKind).toBe("id_card")
		expect(getKycCaptureGuide("business_registration").frameKind).toBe("registry_page")
		expect(getKycCaptureGuide("tax_document").frameKind).toBe("tax_certificate")
		expect(kycCaptureSharedTips.length).toBeGreaterThanOrEqual(3)
	})

	it("wires capture coach visual frame + tip chips + mobile-first file field", () => {
		const coach = read("src/components/provider/ProviderKycCaptureCoach.astro")
		const file = read("src/components/provider/ProviderKycFileField.astro")
		const form = read("src/components/provider/ProviderKycUploadForm.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")

		expect(coach).toContain("data-kyc-capture-coach")
		expect(coach).toContain("data-kyc-capture-frame-visual")
		expect(coach).toContain("data-kyc-capture-tips")
		expect(coach).toContain("data-kyc-capture-tip")
		expect(coach).toContain("data-kyc-capture-example")
		expect(coach).toContain("data-kyc-capture-mobile-hint")
		expect(coach).toContain("data-kyc-capture-collapsed")
		expect(coach).not.toMatch(/Persona|Jumio|Onfido|selfie/i)

		expect(file).toContain("data-kyc-file-field")
		expect(file).toContain("data-kyc-file-before-pick")
		expect(file).toContain("data-kyc-file-guide={guide.frameKind}")
		expect(file).toContain("data-kyc-file-guide-label")
		expect(file).toContain("{guide.frameLabel}")
		expect(file).toContain("data-kyc-file-guide-example")
		expect(file).toContain("{guide.example}")
		expect(file).toContain("data-kyc-file-guide-tips")
		expect(file).toContain("guide.tips.slice(0, 2)")
		expect(file).toContain("data-kyc-file-guide-mobile-hint")
		expect(file).toContain("{guide.mobileHint}")
		expect(file).toContain("data-kyc-file-dropzone")
		expect(file.indexOf("data-kyc-file-before-pick")).toBeLessThan(
			file.indexOf("data-kyc-file-dropzone")
		)
		expect(file).toContain("Toca para elegir o tomar foto")
		expect(file).toContain("data-kyc-file-preview")
		expect(file).toContain("sr-only")
		expect(file).toContain("12 MB")
		expect(file).toContain('data-kyc-capture-mobile="v3"')

		expect(form).toContain("ProviderKycCaptureCoach")
		expect(form).toContain("ProviderKycFileField")
		expect(form).toContain("data-kyc-inline-upload-form")
		expect(form).toContain('data-kyc-capture-timing="v1"')

		expect(card).toContain("ProviderKycUploadForm")
		expect(card).toContain('data-kyc-capture-polish="v2"')
		expect(card).toContain("data-kyc-slot-upload-elevated")
		expect(card).not.toMatch(/Persona|Jumio|Onfido/i)
	})
})
