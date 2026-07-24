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
			stateLabel: "En revisión",
			reviewNotes: null,
		})
		expect(slots[2]).toMatchObject({
			type: "tax_document",
			state: "rejected",
			stateLabel: "Rechazado",
			reviewNotes: "NIT ilegible, reenviar escaneo nítido",
			uploadHref: "/provider/settings/verification?type=tax_document#kyc-upload",
		})
	})

	it("wires verification page to slots card, reject reason and type preselect", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")

		expect(page).toContain("buildRequiredKycSlots")
		expect(page).toContain("ProviderKycSlotsCard")
		expect(page).toContain('searchParams.get("type")')
		expect(page).toContain('id="kyc-upload"')
		expect(page).toContain("Motivo del rechazo")

		expect(card).toContain("Checklist KYC")
		expect(card).toContain("Motivo del rechazo")
		expect(card).toContain("Reenviar documento")
		expect(card).toContain("slot.stateLabel")
		expect(card).toContain("slot.uploadHref")
		expect(card).toContain('slot.state === "rejected"')

		const lib = read("src/lib/provider-documents.ts")
		expect(lib).toContain('missing: "Falta enviar"')
		expect(lib).toContain('pending: "En revisión"')
		expect(lib).toContain("buildRequiredKycSlots")

		expect(view).not.toContain("gobernanza canónica")
		expect(view).not.toContain("Set KYC mínimo")
		expect(view).toContain("Documentos mínimos")
		expect(view).not.toMatch(/Faltan verificados: \$\{kyc\.missingRequiredTypes\.join/)
	})
})
