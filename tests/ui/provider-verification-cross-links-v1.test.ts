import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { readVerificationSurface } from "./read-verification-surface"

import {
	buildProviderTrustMap,
	buildVerificationCrossLinks,
	PROFILE_LEGAL_NAME_HREF,
	resolveTrustAlignedHubCoach,
	resolveVerificationNextStep,
} from "@/lib/provider-trust-map"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("V1 verification cross-links + hub coach alignment", () => {
	it("builds Perfil · Fiscal · Pagos cross-links with emphasis", () => {
		const linksMissingLegal = buildVerificationCrossLinks({
			legalNameComplete: false,
			nextStepLinkId: "business",
		})
		expect(linksMissingLegal.map((link) => link.id)).toEqual([
			"profile",
			"fiscal",
			"payments",
		])
		expect(linksMissingLegal.find((link) => link.id === "profile")?.emphasized).toBe(true)
		expect(linksMissingLegal.find((link) => link.id === "profile")?.href).toBe(
			PROFILE_LEGAL_NAME_HREF
		)
		expect(linksMissingLegal.find((link) => link.id === "fiscal")?.href).toContain(
			"/verification/fiscal"
		)
		expect(linksMissingLegal.find((link) => link.id === "payments")?.href).toContain("/payments")

		const linksFiscal = buildVerificationCrossLinks({
			legalNameComplete: true,
			nextStepLinkId: "fiscal",
		})
		expect(linksFiscal.find((link) => link.id === "fiscal")?.emphasized).toBe(true)

		const linksPayments = buildVerificationCrossLinks({
			legalNameComplete: true,
			nextStepLinkId: "payments",
			fiscalReady: true,
			paymentsReady: false,
		})
		expect(linksPayments.find((link) => link.id === "payments")?.emphasized).toBe(true)
	})

	it("gates next step to Perfil when legal name is missing", () => {
		const trustLinks = buildProviderTrustMap({
			accountStatus: "pending",
			documentsComplete: false,
			hasMissingDocs: true,
		})
		const next = resolveVerificationNextStep({
			trustLinks,
			legalNameComplete: false,
			canManageDocuments: true,
		})
		expect(next.ctaHref).toBe(PROFILE_LEGAL_NAME_HREF)
		expect(next.anchorsKyc).toBe(false)
		expect(next.title.toLowerCase()).toMatch(/razón social|perfil/)
	})

	it("aligns hub coach blockers with trust map vocabulary", () => {
		expect(resolveTrustAlignedHubCoach({ id: "identity", label: "x", href: "/p" })?.label).toMatch(
			/Perfil/
		)
		expect(
			resolveTrustAlignedHubCoach({ id: "documents", label: "x", href: "/v" })?.label
		).toMatch(/Negocio/)
		expect(
			resolveTrustAlignedHubCoach({ id: "fiscality", label: "x", href: "/t" })?.label
		).toMatch(/Fiscal/)
		expect(resolveTrustAlignedHubCoach({ id: "payments", label: "x", href: "/pay" })?.label).toMatch(
			/Pagos/
		)
		expect(
			resolveTrustAlignedHubCoach({ id: "verification", label: "x", href: "/v" })?.label
		).toMatch(/Identidad/)
	})

	it("wires cross-links into verification next-step surface", () => {
		const page = readVerificationSurface("src/pages/provider/settings/verification.astro")
		const next = read("src/components/provider/ProviderVerificationNextStep.astro")
		const cross = read("src/components/provider/ProviderVerificationCrossLinks.astro")
		const register = read("src/components/provider/ProviderRegisterForm.astro")

		expect(page).toContain("buildVerificationCrossLinks")
		expect(page).toContain("legalNameComplete")
		expect(page).toContain("crossLinks={crossLinks}")
		expect(page).toContain("onlyOffPage: true")

		expect(next).not.toContain("ProviderVerificationCrossLinks")
		expect(next).not.toContain("También conecta")
		expect(next).not.toContain("data-verification-cross-links")
		expect(next).not.toContain("crossLinks.length")
		expect(cross).toContain("data-verification-cross-links")
		expect(cross).toContain("data-cross-link")

		expect(register).toContain('id="legalName"')
		expect(PROFILE_LEGAL_NAME_HREF).toContain("#legalName")
	})
})
