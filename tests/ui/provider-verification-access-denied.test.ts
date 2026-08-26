import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { readVerificationSurface } from "./read-verification-surface"

import { buildRequiredKycSlots } from "@/lib/provider-documents"
import {
	buildDocumentsAccessDeniedNextStep,
	buildProviderTrustMap,
	resolveVerificationNextStep,
} from "@/lib/provider-trust-map"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("P0 verification documents access-denied UX", () => {
	it("builds access-denied next step with human role + team CTA", () => {
		const step = buildDocumentsAccessDeniedNextStep({ roleLabel: "Operaciones" })
		expect(step.anchorsKyc).toBe(false)
		expect(step.eyebrow).toBe("Acceso")
		expect(step.body).toContain("Operaciones")
		expect(step.body).not.toMatch(/pide a un administrador/i)
		expect(step.ctaLabel).toMatch(/equipo/i)
		expect(step.ctaHref).toBe("/provider/settings/team")
	})

	it("does not fake upload CTA when role cannot manage documents", () => {
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
		expect(next.anchorsKyc).toBe(false)
		expect(next.ctaHref).toBe("/provider/settings/team")
		expect(next.ctaLabel).not.toMatch(/ver documento en foco/i)
		expect(next.title).toMatch(/no puedes enviar/i)
	})

	it("keeps upload next step when canManageDocuments", () => {
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
			roleLabel: "Propietario",
		})
		expect(next.anchorsKyc).toBe(true)
		expect(next.ctaKind).toBe("upload")
		expect(next.ctaHref).toContain("#kyc-slot-")
		expect(next.ctaLabel).toBe("Enviar a revisión")
	})

	it("wires verification pages to access card instead of empty upload journey", () => {
		const page = readVerificationSurface("src/pages/provider/settings/verification.astro")
		const optionals = read("src/pages/provider/settings/verification/documents.astro")
		const card = read("src/components/provider/ProviderDocumentsAccessDenied.astro")
		const kyc = read("src/components/provider/ProviderKycSlotsCard.astro")
		const trust = read("src/lib/provider-trust-map.ts")

		expect(trust).toContain("buildDocumentsAccessDeniedNextStep")
		expect(trust).not.toContain("Ver documento en foco")

		expect(card).toContain("data-documents-access-denied")
		expect(card).toContain("data-documents-access-team-cta")
		expect(card).toContain("providerSettingsTeam")
		expect(card).toContain("Tu rol")

		expect(page).toContain("ProviderDocumentsAccessDenied")
		expect(page).toContain("formatProviderRoleLabel")
		expect(page).toContain("roleLabel: params.providerRoleLabel")
		expect(page).toContain("canManageDocuments ? (")
		expect(page).toContain("<ProviderKycSlotsCard")
		expect(page).not.toContain("Pide a un administrador del proveedor")

		expect(optionals).toContain("ProviderDocumentsAccessDenied")
		expect(optionals).toContain('surface="optional"')
		expect(optionals).toContain("canManageDocuments ? (")

		expect(kyc).toContain("data-kyc-slot-access-denied")
		expect(kyc).toContain("providerSettingsTeam")
		expect(kyc).not.toContain("Pide a un administrador del proveedor")
	})
})
