import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { buildRequiredKycSlots } from "@/lib/provider-documents"
import {
	buildProviderTrustMap,
	buildVerificationCrossLinks,
	resolveVerificationNextStep,
	shouldShowVerificationCrossLinks,
} from "@/lib/provider-trust-map"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("P1 verification density", () => {
	it("hides cross-links during on-page upload / access jobs", () => {
		expect(
			shouldShowVerificationCrossLinks({
				ctaKind: "upload",
				nextStepLinkId: "business",
				legalNameComplete: true,
			})
		).toBe(false)
		expect(
			shouldShowVerificationCrossLinks({
				ctaKind: "access",
				nextStepLinkId: "business",
				legalNameComplete: true,
			})
		).toBe(false)
		expect(
			shouldShowVerificationCrossLinks({
				ctaKind: "status",
				nextStepLinkId: "business",
				legalNameComplete: true,
			})
		).toBe(false)
		expect(
			shouldShowVerificationCrossLinks({
				ctaKind: "navigate",
				nextStepLinkId: "fiscal",
				legalNameComplete: true,
			})
		).toBe(true)
		expect(
			shouldShowVerificationCrossLinks({
				ctaKind: "upload",
				nextStepLinkId: "business",
				legalNameComplete: false,
			})
		).toBe(true)

		expect(
			buildVerificationCrossLinks({
				legalNameComplete: true,
				nextStepLinkId: "business",
				onlyOffPage: true,
				ctaKind: "upload",
			})
		).toEqual([])

		expect(
			buildVerificationCrossLinks({
				legalNameComplete: true,
				nextStepLinkId: "fiscal",
				onlyOffPage: true,
				ctaKind: "navigate",
			}).map((link) => link.id)
		).toEqual(["profile", "fiscal", "payments"])
	})

	it("keeps a single hero consequence for upload jobs", () => {
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
			legalNameComplete: true,
		})
		expect(next.ctaKind).toBe("upload")
		expect(next.consequenceLine).toBeTruthy()
	})

	it("wires compact rail, one-job slots, suppress status consequence, and no main cross-links", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const rail = read("src/components/provider/ProviderTrustMapRail.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")
		const next = read("src/components/provider/ProviderVerificationNextStep.astro")

		expect(rail).toContain('data-trust-map-compact="true"')
		expect(rail).toContain('data-trust-map-quiet="true"')
		expect(rail).not.toContain("line-clamp-2")
		expect(rail).not.toContain("Identidad ≠ documentos")

		expect(card).toContain('data-kyc-one-job')
		expect(card).not.toContain("data-kyc-one-job-hint")
		expect(card).toContain("showSubmitButton={true}")
		expect(card).toContain("data-kyc-elevated-title")
		expect(card).not.toContain("data-kyc-empty-example")
		expect(card).not.toContain("data-kyc-collapsed-slots")
		expect(card).not.toContain("data-kyc-slot-collapsed")
		expect(card).not.toContain(">Otros mínimos<")
		expect(card).toContain("!elevated &&")
		expect(card).toContain("data-kyc-slot-consequence")

		expect(view).toContain("suppressConsequence")
		expect(page).toContain("suppressConsequence={suppressStatusConsequence}")
		expect(page).toContain("onlyOffPage: true")
		expect(page).toContain("ctaKind: nextStep.ctaKind")
		expect(page).toContain("data-verification-docs-fold")
		expect(page).toContain('form="kyc-inline-upload-form"')

		expect(next).not.toContain("crossLinks.length")
		expect(next).not.toContain("También conecta")
	})
})
