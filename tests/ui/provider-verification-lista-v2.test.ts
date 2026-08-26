import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { readVerificationSurface } from "./read-verification-surface"

import {
	buildProviderTrustMap,
	isProviderTrustMapComplete,
	resolveVerificationNextStep,
	TRUST_GLOSSARY,
	VERIFICATION_PUBLISH_HREF,
} from "@/lib/provider-trust-map"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function readyTrustLinks() {
	return buildProviderTrustMap({
		accountStatus: "approved",
		documentsComplete: true,
		hasMissingDocs: false,
		hasRejectedDocs: false,
		hasSubmittedDocs: false,
		fiscalStatus: "verified",
		verifiedPaymentAccounts: 1,
		pendingPaymentAccounts: 0,
	})
}

describe("V2 Lista — trust map complete success state", () => {
	it("marks trust map complete with no focus when all links are ready", () => {
		const links = readyTrustLinks()
		expect(isProviderTrustMapComplete(links)).toBe(true)
		expect(links.every((link) => link.uiState === "ready")).toBe(true)
		expect(links.every((link) => !link.isFocus)).toBe(true)
		expect(links.map((link) => link.stateLabel)).toEqual([
			TRUST_GLOSSARY.trustLink.ready,
			TRUST_GLOSSARY.trustLink.ready,
			TRUST_GLOSSARY.trustLink.ready,
			TRUST_GLOSSARY.trustLink.ready,
		])
	})

	it("resolves Lista hero with publish + payments CTAs and no consequence", () => {
		const next = resolveVerificationNextStep({
			trustLinks: readyTrustLinks(),
			legalNameComplete: true,
			canManageDocuments: true,
		})
		expect(next.tone).toBe("success")
		expect(next.eyebrow).toBe(TRUST_GLOSSARY.page.readyEyebrow)
		expect(next.title).toBe(TRUST_GLOSSARY.page.readyTitle)
		expect(next.consequenceLine).toBeNull()
		expect(next.anchorsKyc).toBe(false)
		expect(next.ctaHref).toBe(VERIFICATION_PUBLISH_HREF)
		expect(next.ctaLabel).toBe(TRUST_GLOSSARY.page.readyPrimaryCta)
		expect(next.secondaryCtaHref).toContain("/payments")
		expect(next.secondaryCtaLabel).toBe(TRUST_GLOSSARY.page.readySecondaryCta)
	})

	it("does not claim Lista while any eslabón is incomplete", () => {
		const links = buildProviderTrustMap({
			accountStatus: "approved",
			documentsComplete: true,
			fiscalStatus: "verified",
			verifiedPaymentAccounts: 0,
		})
		expect(isProviderTrustMapComplete(links)).toBe(false)
		const next = resolveVerificationNextStep({
			trustLinks: links,
			legalNameComplete: true,
		})
		expect(next.tone).not.toBe("success")
		expect(next.consequenceLine).toBeTruthy()
	})

	it("wires Lista UI without yellow consequence", () => {
		const page = readVerificationSurface("src/pages/provider/settings/verification.astro")
		const next = read("src/components/provider/ProviderVerificationNextStep.astro")
		const rail = read("src/components/provider/ProviderTrustMapRail.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")

		expect(page).toContain("isProviderTrustMapComplete")
		expect(page).toContain("isVerificationListaReady")
		expect(page).toContain("listaReady")
		expect(page).toContain("data-verification-lista-docs")

		expect(next).toContain('data-next-step-tone')
		expect(next).not.toContain("data-next-step-secondary-cta")
		expect(next).not.toContain("ProviderVerificationCrossLinks")
		expect(next).toContain("!isSuccess")
		expect(next).toContain("consequenceLine && !isSuccess")

		expect(rail).toContain("data-trust-map-complete")
		expect(rail).toContain("railComplete")

		expect(view).toContain("trustMapComplete")
		expect(view).toContain("showWarningConsequence")
		expect(view).toContain('data-verification-consequence-tone="success"')
	})
})
