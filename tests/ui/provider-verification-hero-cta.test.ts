import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { buildRequiredKycSlots } from "@/lib/provider-documents"
import {
	buildDocumentsUploadNextStep,
	buildProviderTrustMap,
	resolveVerificationNextStep,
} from "@/lib/provider-trust-map"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("P0 hero CTA aligned to permission", () => {
	it("owner upload CTA matches form submit verb and anchors the slot", () => {
		const step = buildDocumentsUploadNextStep({
			slot: { type: "government_id", label: "Documento de identidad", state: "missing" },
		})
		expect(step.ctaKind).toBe("upload")
		expect(step.ctaLabel).toBe("Enviar a revisión")
		expect(step.ctaHref).toBe("#kyc-slot-government_id")
		expect(step.anchorsKyc).toBe(true)

		const form = read("src/components/provider/ProviderKycUploadForm.astro")
		expect(form).toContain("Enviar a revisión")
		expect(form).toContain("data-kyc-submit")
	})

	it("rejected upload uses Corregir documentos", () => {
		const step = buildDocumentsUploadNextStep({
			slot: { type: "government_id", label: "Documento de identidad", state: "rejected" },
		})
		expect(step.ctaLabel).toBe("Corregir documentos")
		expect(step.ctaKind).toBe("upload")
	})

	it("staff never gets upload CTA; access CTA goes to Equipo", () => {
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
			canManageDocuments: false,
			roleLabel: "Operaciones",
		})
		expect(next.ctaKind).toBe("access")
		expect(next.ctaHref).toBe("/provider/settings/team")
		expect(next.ctaLabel).not.toMatch(/envío|enviar a revisión|ver documento/i)
	})

	it("staff pending docs do not use dead #kyc-slot anchors", () => {
		const trustLinks = buildProviderTrustMap({
			accountStatus: "pending",
			documentsComplete: false,
			hasSubmittedDocs: true,
			fiscalStatus: "not_configured",
		})
		const next = resolveVerificationNextStep({
			trustLinks,
			focusSlot: {
				type: "government_id",
				label: "Documento de identidad",
				state: "pending",
			},
			canManageDocuments: false,
			roleLabel: "Operaciones",
		})
		expect(next.ctaKind).toBe("status")
		expect(next.ctaHref).toBe("#documents-access-status")
		expect(next.anchorsKyc).toBe(false)
		expect(next.ctaHref).not.toContain("#kyc-slot-")
	})

	it("wires next-step ctaKind attribute and never Ver documento en foco", () => {
		const trust = read("src/lib/provider-trust-map.ts")
		const next = read("src/components/provider/ProviderVerificationNextStep.astro")
		const access = read("src/components/provider/ProviderDocumentsAccessDenied.astro")

		expect(trust).toContain("buildDocumentsUploadNextStep")
		expect(trust).toContain("Enviar a revisión")
		expect(trust).not.toContain("Ver documento en foco")
		expect(trust).not.toContain("Ir al envío")

		expect(next).toContain("data-next-step-cta-kind")
		expect(next).not.toContain("data-next-step-cta-relocated")

		const page = read("src/pages/provider/settings/verification.astro")
		expect(page).not.toContain("data-cta-kind")
		expect(page).not.toContain("data-next-step-cta")
		expect(page).not.toContain('slot="actions"')

		expect(access).toContain('id="documents-access-status"')
	})
})
