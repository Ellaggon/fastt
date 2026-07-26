import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	buildRequiredKycSlots,
	requiredKycDocumentTypes,
	type ProviderDocumentRecord,
} from "@/lib/provider-documents"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function doc(
	partial: Partial<ProviderDocumentRecord> & Pick<ProviderDocumentRecord, "type" | "status">
): ProviderDocumentRecord {
	return {
		id: partial.id ?? `${partial.type}-${partial.status}`,
		providerId: "provider-1",
		type: partial.type,
		typeLabel: partial.typeLabel ?? partial.type,
		status: partial.status,
		statusLabel: partial.statusLabel ?? partial.status,
		tone: partial.tone ?? "neutral",
		fileUrl: partial.fileUrl ?? null,
		fileName: partial.fileName ?? null,
		mimeType: partial.mimeType ?? null,
		sizeBytes: partial.sizeBytes ?? null,
		submissionNotes: partial.submissionNotes ?? null,
		reviewNotes: partial.reviewNotes ?? null,
		reviewedAt: partial.reviewedAt ?? null,
		reviewedBy: partial.reviewedBy ?? null,
		createdAt: partial.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: partial.updatedAt ?? new Date("2026-01-02T00:00:00.000Z"),
	}
}

describe("S1-1 KYC slots + reject reason", () => {
	it("builds three minimum slots with missing/pending/verified/rejected and reject notes", () => {
		const slots = buildRequiredKycSlots({
			documents: [
				doc({
					type: "government_id",
					status: "verified",
					fileName: "id.pdf",
				}),
				doc({
					type: "business_registration",
					status: "pending",
					fileName: "reg.pdf",
				}),
				doc({
					type: "tax_document",
					status: "rejected",
					fileName: "tax.pdf",
					reviewNotes: "NIT ilegible, reenviar escaneo nítido",
				}),
				doc({
					type: "tax_document",
					status: "superseded",
					fileName: "old-tax.pdf",
					reviewNotes: "ignored",
				}),
			],
		})

		expect(slots).toHaveLength(3)
		expect(slots.map((slot) => slot.type)).toEqual([...requiredKycDocumentTypes])

		expect(slots[0]).toMatchObject({
			type: "government_id",
			state: "verified",
			stateLabel: "Verificado",
			fileName: "id.pdf",
			reviewNotes: null,
		})
		expect(slots[1]).toMatchObject({
			type: "business_registration",
			state: "pending",
			stateLabel: "Enviado",
			reviewNotes: null,
		})
		expect(slots[2]).toMatchObject({
			type: "tax_document",
			state: "rejected",
			stateLabel: "Requiere cambios",
			reviewNotes: "NIT ilegible, reenviar escaneo nítido",
			rejectCategoryLabel: null,
			consequence: expect.stringContaining("liquidar cobros"),
			uploadHref: "/provider/settings/verification?type=tax_document#kyc-slot-tax_document",
		})
	})

	it("wires verification page to slots card, reject reason and type preselect", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")

		expect(page).toContain("buildRequiredKycSlots")
		expect(page).toContain("ProviderKycSlotsCard")
		expect(page).toContain('searchParams.get("type")')
		expect(page).toContain("focusType={requestedType}")
		expect(page).toContain("data-verification-optionals-entry")
		expect(page).toContain("providerSettingsVerificationDocuments")
		expect(page).not.toContain("data-optional-upload-form")

		expect(card).toContain("Documentos mínimos")
		expect(card).toContain("Motivo del rechazo")
		expect(card).toContain("Reenviar documento")
		expect(card).toContain("slot.stateLabel")
		expect(card).toContain("ProviderKycUploadForm")
		expect(card).toContain("data-kyc-slot-consequence")
		expect(card).toContain("rejectCategoryLabel")
		expect(card).toContain('slot.state === "rejected"')
		expect(card).toContain("href={slot.uploadHref}")
		expect(card).toContain("data-kyc-one-job")
		expect(card).not.toContain("data-kyc-collapsed-slots")
		expect(card).not.toContain("Hacer después")
		expect(card).toContain("data-kyc-slot-review-state")
		expect(card).toContain("Documento en revisión")
		expect(card).toContain("data-kyc-slot-submitted-file")
		expect(card).toContain("Archivo enviado")
		expect(card).toContain("data-kyc-slot-next-action")
		expect(card).toContain("Continuar a Fiscalidad")
		expect(card).toContain('slot.state === "missing" || slot.state === "rejected"')

		const form = read("src/components/provider/ProviderKycUploadForm.astro")
		expect(form).toContain("data-kyc-inline-upload-form")

		const lib = read("src/lib/provider-documents.ts")
		expect(lib).toContain('missing: "Falta"')
		expect(lib).toContain('pending: "Enviado"')
		expect(lib).toContain("buildRequiredKycSlots")
		expect(lib).toContain("kycSlotConsequences")

		expect(view).not.toContain("gobernanza canónica")
		expect(view).not.toContain("Set KYC mínimo")
		expect(view).toContain('data-verification-matrix="removed"')
		expect(view).toContain("data-verification-consequence")
		expect(view).toContain("data-trust-progress-pointer")
		expect(view).not.toMatch(/Faltan verificados: \$\{kyc\.missingRequiredTypes\.join/)
		expect(view).not.toContain('"Pendiente"')
	})

	it("renders sent documents as review state, not primary upload action", () => {
		const slots = buildRequiredKycSlots({
			documents: [
				doc({
					type: "business_registration",
					status: "pending",
					fileName: "registro.pdf",
				}),
			],
		})
		const business = slots.find((slot) => slot.type === "business_registration")
		expect(business).toMatchObject({
			state: "pending",
			stateLabel: "Enviado",
			fileName: "registro.pdf",
		})

		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const pendingBranchStart = card.indexOf('slot.state === "pending"')
		const pendingBranchEnd = card.indexOf("{bridge ? (", pendingBranchStart)
		const pendingBranch = card.slice(pendingBranchStart, pendingBranchEnd)

		expect(pendingBranch).toContain("data-kyc-slot-review-state")
		expect(pendingBranch).toContain("Documento en revisión")
		expect(pendingBranch).toContain("data-kyc-slot-submitted-file")
		expect(pendingBranch).toContain("data-kyc-slot-next-action")
		expect(pendingBranch).not.toContain("Subir documento")
		expect(pendingBranch).not.toContain("ProviderKycUploadForm")
		expect(card).toContain('if (slot.state !== "missing") return false')
		expect(card).toContain("requestedReviewSlot")
		expect(card).toContain('requestedSlot?.state === "pending"')
		expect(card).toContain("? [requestedReviewSlot]")
	})
})
