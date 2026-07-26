import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { buildRequiredKycSlots } from "@/lib/provider-documents"
import {
	buildProviderTrustMap,
	resolveVerificationNextStep,
} from "@/lib/provider-trust-map"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("V1 verification fold reorder (action-first)", () => {
	it("resolves next-step hero for KYC focus upload", () => {
		const slots = buildRequiredKycSlots({ documents: [] })
		const trustLinks = buildProviderTrustMap({
			accountStatus: "pending",
			documentsComplete: false,
			hasMissingDocs: true,
			fiscalStatus: "not_configured",
		})
		const focus = slots[0]
		const next = resolveVerificationNextStep({
			trustLinks,
			focusSlot: focus
				? { type: focus.type, label: focus.label, state: focus.state }
				: null,
			canManageDocuments: true,
		})
		expect(next.anchorsKyc).toBe(true)
		expect(next.ctaHref).toContain("#kyc-slot-")
		expect(next.title.toLowerCase()).toMatch(/sube|corrige/)
		expect(next.consequenceLine).toBeTruthy()
	})

	it("orders page: trust nav → identity panel → business docs panel → optionals entry", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const panelClient = read("src/pages/provider/settings/_client/verification-trust-panels.js")
		const navIdx = page.indexOf("data-verification-trust-nav")
		const identityPanelIdx = page.indexOf('data-verification-trust-panel="identity"')
		const foldIdx = page.indexOf("data-verification-docs-fold")
		const kycIdx = page.indexOf("<ProviderKycSlotsCard")
		const railIdx = page.indexOf("<ProviderTrustMapRail")
		const nextIdx = page.indexOf("<ProviderVerificationNextStep")
		const statusIdx = page.indexOf("<ProviderVerificationView")
		const optionalsIdx = page.indexOf("data-verification-optionals-entry")

		expect(navIdx).toBeGreaterThan(-1)
		expect(railIdx).toBeGreaterThan(navIdx)
		expect(identityPanelIdx).toBeGreaterThan(railIdx)
		expect(statusIdx).toBeGreaterThan(identityPanelIdx)
		expect(foldIdx).toBeGreaterThan(-1)
		expect(foldIdx).toBeGreaterThan(statusIdx)
		expect(kycIdx).toBeGreaterThan(foldIdx)
		expect(card).toContain('slot name="map"')
		expect(card).toContain("data-verification-docs-map")
		expect(nextIdx).toBeGreaterThan(kycIdx)
		expect(page).toContain('slot="intro"')
		expect(optionalsIdx).toBeGreaterThan(nextIdx)

		expect(page).toContain("elevated")
		expect(page).toContain('placement="primary"')
		expect(page).toContain("verification-trust-panels.js")
		expect(panelClient).toContain("syncVerificationTrustPanels")
		expect(panelClient).toContain("handleVerificationTrustClick")
		expect(panelClient).toContain("window.history.pushState")
		expect(panelClient).toContain("astro:page-load")
		expect(page).toContain("resolveVerificationNextStep")
		expect(page).toContain("providerSettingsVerificationDocuments")
		expect(page).not.toContain("data-optional-upload-form")
	})

	it("wires elevated upload + collapsed status panel", () => {
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")
		const next = read("src/components/provider/ProviderVerificationNextStep.astro")

		expect(card).toContain("data-kyc-elevated")
		expect(card).toContain("data-kyc-slot-upload-elevated")
		expect(card).toContain("!elevated && (missingCount || rejectedCount)")

		expect(view).toContain('placement === "secondary"')
		expect(view).toContain("data-verification-status-panel")
		expect(view).toContain('id="verification-status-panel"')

		expect(next).toContain("data-verification-next-step")
		expect(next).not.toContain("data-next-step-cta-relocated")
		const page = read("src/pages/provider/settings/verification.astro")
		expect(page).toContain('data-next-step-cta')
		expect(page).toContain('form="kyc-inline-upload-form"')
		expect(card).toContain("data-kyc-elevated-title")
	})
})
