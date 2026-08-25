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

describe("UX plan — guided verification (V1–V4)", () => {
	it("V1 hero exposes progress + consequence + guided marker", () => {
		const slots = buildRequiredKycSlots({ documents: [] })
		const trustLinks = buildProviderTrustMap({
			accountStatus: "pending",
			documentsComplete: false,
			hasMissingDocs: true,
			fiscalStatus: "not_configured",
		})
		const focus = slots[0]!
		const next = resolveVerificationNextStep({
			trustLinks,
			focusSlot: { type: focus.type, label: focus.label, state: focus.state },
			canManageDocuments: true,
			kycProgress: { ready: 0, total: 3 },
		})
		expect(next.progressLabel).toBe("0/3 listos")
		expect(next.consequenceLine).toMatch(/liquidar|publicar/i)
		expect(next.ctaHref).toContain("#kyc-slot-")

		const hero = read("src/components/provider/ProviderVerificationNextStep.astro")
		const layout = read("src/layouts/ProviderSettingsLayout.astro")
		const page = read("src/pages/provider/settings/verification.astro")
		expect(hero).toContain('data-verification-hero="wizard"')
		expect(hero).not.toContain("data-verification-wizard-steps")
		expect(hero).not.toContain("SegmentedControl")
		expect(hero).toContain("data-next-step-consequence")
		expect(hero).toContain("copyOnly")
		expect(hero).toContain("data-next-step-copy")
		expect(layout).toContain("data-verification-wizard-progress")
		expect(layout).toContain("fastt-progress-track")
		expect(layout).toContain("bg-slate-800")
		expect(layout).toContain('class="mb-5 space-y-2"')
		expect(layout).toContain("data-next-step-progress")
		expect(page).toContain("progressStep=")
		expect(page).toContain("progressTotal={showWizardProgress ? trustLinks.length : null}")
		expect(page).toContain("showSettingsTabs={false}")
		expect(page).not.toContain('href={nextStep.ctaHref}')
		expect(page).not.toContain("Continuar a Negocio")
		expect(page).not.toContain('slot="actions"')
		expect(page).toContain("data-verification-docs-fold")
		expect(page).toContain("copyOnly")
	})

	it("V1 collapses matrix and optionals; no ops jerga residual", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")

		expect(page).toContain("data-verification-optionals-collapsed")
		expect(page).toContain("Documentos adicionales si te los pedimos")
		expect(page).not.toMatch(/checklist de cumplimiento/i)
		expect(view).toContain('data-verification-matrix="removed"')
		expect(view).not.toContain("Matriz de revisión")
		expect(view).not.toContain("dimensiones independientes")
		expect(view).not.toContain("checklist de documentos")
		expect(view).toContain("data-trust-progress-pointer")
	})

	it("V2 inline upload + tips collapsed; post-submit keeps slot type", () => {
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const form = read("src/components/provider/ProviderKycUploadForm.astro")
		const coach = read("src/components/provider/ProviderKycCaptureCoach.astro")
		const api = read("src/pages/api/provider/settings/documents.ts")

		expect(card).toContain("ProviderKycUploadForm")
		expect(card).toContain("data-kyc-elevated-title")
		expect(card).not.toContain("data-kyc-empty-example")
		expect(form).toContain("data-kyc-inline-upload-form")
		expect(form).toContain("data-kyc-submission-notes")
		expect(coach).toContain("data-kyc-capture-tips")
		expect(coach).toContain("data-kyc-capture-collapsed")
		expect(api).toContain('target.searchParams.set("type", type)')
	})

	it("V3 file preview thumb + ID anverso/reverso coaching", () => {
		const field = read("src/components/provider/ProviderKycFileField.astro")
		const coach = read("src/components/provider/ProviderKycCaptureCoach.astro")

		expect(field).toContain("data-kyc-file-preview")
		expect(field).toContain("data-kyc-file-preview-thumb")
		expect(field).toContain("createObjectURL")
		expect(coach).toContain("data-kyc-capture-sides")
		expect(coach).toContain("Anverso y reverso")
		expect(coach).toContain("data-kyc-capture-example")
	})

	it("V4 trust stepper + fiscal bridge + account rejected prioritizes docs", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		expect(page).toContain("ProviderTrustMapRail")
		expect(page).toContain("accountRejectCategoryLabel")

		const links = buildProviderTrustMap({
			accountStatus: "rejected",
			documentsComplete: false,
			hasRejectedDocs: true,
			hasMissingDocs: false,
			fiscalStatus: "not_configured",
			legalNameComplete: true,
		})
		expect(links.find((l) => l.id === "business")?.isFocus).toBe(true)
		expect(links.find((l) => l.id === "identity")?.isFocus).toBe(false)

		const next = resolveVerificationNextStep({
			trustLinks: links,
			focusSlot: {
				type: "government_id",
				label: "Documento de identidad",
				state: "rejected",
				rejectCategoryLabel: "Documento ilegible",
			},
			canManageDocuments: true,
			accountStatus: "rejected",
			accountRejectCategoryLabel: "Documento ilegible",
			kycProgress: { ready: 0, total: 3 },
		})
		expect(next.ctaLabel).toBe("Corregir documentos")
		expect(next.rejectCategoryLabel).toBe("Documento ilegible")
		expect(next.ctaHref).toContain("#kyc-slot-government_id")

		const rejectedStep = buildDocumentsUploadNextStep({
			slot: { type: "tax_document", label: "Documento fiscal", state: "rejected" },
			accountRejected: true,
			rejectCategoryLabel: "Dato no coincide",
		})
		expect(rejectedStep.ctaLabel).toBe("Corregir documentos")
		expect(rejectedStep.eyebrow).toBe("Requiere cambios")
	})
})
