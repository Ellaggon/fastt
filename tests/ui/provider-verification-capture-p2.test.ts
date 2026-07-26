import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	getKycCaptureGuide,
	parseKycCaptureTimingTarget,
	requiredKycDocumentTypes,
} from "@/lib/provider-documents"
import { SETTINGS_FUNNEL_EVENTS } from "@/lib/provider-settings-funnel"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("P2 KYC capture — mobile file UX + time-to-upload", () => {
	it("marks government_id for camera shortcut; PDF-first types stay file-first", () => {
		expect(getKycCaptureGuide("government_id").preferCameraCapture).toBe(true)
		expect(getKycCaptureGuide("business_registration").preferCameraCapture).toBe(false)
		expect(getKycCaptureGuide("tax_document").preferCameraCapture).toBe(false)
		for (const type of requiredKycDocumentTypes) {
			expect(getKycCaptureGuide(type).preferCameraCapture).toBeTypeOf("boolean")
		}
	})

	it("parses time-to-upload beacon ctaTarget payloads", () => {
		expect(parseKycCaptureTimingTarget("doc=government_id;ms=4200;file_to_submit_ms=800")).toEqual({
			documentType: "government_id",
			durationMs: 4200,
			fileToSubmitMs: 800,
		})
		expect(parseKycCaptureTimingTarget("doc=tax_document;ms=1500")).toEqual({
			documentType: "tax_document",
			durationMs: 1500,
			fileToSubmitMs: null,
		})
		expect(parseKycCaptureTimingTarget("")).toEqual({
			documentType: null,
			durationMs: null,
			fileToSubmitMs: null,
		})
	})

	it("wires mobile camera CTA, collapsed tips, timing attrs, and funnel event", () => {
		const file = read("src/components/provider/ProviderKycFileField.astro")
		const coach = read("src/components/provider/ProviderKycCaptureCoach.astro")
		const form = read("src/components/provider/ProviderKycUploadForm.astro")
		const beacon = read("src/pages/provider/settings/_client/settings-funnel-beacon.js")
		const funnel = read("src/lib/provider-settings-funnel.ts")
		const page = read("src/pages/provider/settings/verification.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")

		expect(file).toContain('data-kyc-capture-mobile="v3"')
		expect(file).toContain("data-kyc-file-camera-trigger")
		expect(file).toContain('capture="environment"')
		expect(file).toContain("touch-manipulation")
		expect(file).toContain("image/*")
		expect(file).toContain("Tomar foto con la cámara")

		expect(coach).toContain("data-kyc-capture-tips-mobile")
		expect(coach).toContain("Consejos de captura")
		expect(coach).toContain("data-kyc-capture-collapsed")

		expect(form).toContain('data-kyc-capture-timing="v1"')
		expect(form).toContain('data-funnel-domain="documents"')
		expect(form).toContain('data-funnel-surface="verification"')
		expect(form).toContain("data-kyc-submission-notes")
		expect(SETTINGS_FUNNEL_EVENTS.kycCaptureTiming).toBe(
			"provider.settings.funnel.kyc_capture_timing"
		)
		expect(funnel).toContain("kyc_capture_timing")
		expect(beacon).toContain("bindKycCaptureTiming")
		expect(beacon).toContain("open_to_file")
		expect(beacon).toContain("open_to_submit")
		expect(beacon).toContain("file_to_submit_ms")

		// Owner session mounts elevated upload (P0); capture only valid when form is present.
		expect(page).toContain("canManageDocuments")
		expect(page).toContain("requireProviderSessionSurface")
		expect(card).toContain("data-kyc-slot-upload-elevated")
		expect(card).toContain("ProviderKycUploadForm")
	})
})
