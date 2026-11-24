import { describe, expect, it } from "vitest"
import { accountDocumentEvidenceSignals } from "@/modules/casework/application/queries/case-evidence"
import type { ProviderDocumentRecord } from "@/lib/provider-documents"

function document(overrides: Partial<ProviderDocumentRecord> = {}): ProviderDocumentRecord {
	return {
		id: "registration",
		providerId: "provider",
		type: "business_registration",
		typeLabel: "Registro mercantil",
		status: "rejected",
		statusLabel: "Requiere cambios",
		tone: "error",
		fileUrl: null,
		fileName: "registro.pdf",
		mimeType: "application/pdf",
		sizeBytes: 123,
		submissionNotes: null,
		issuer: null,
		issuedAt: null,
		expiresAt: null,
		subjectType: "provider",
		subjectReference: null,
		scopes: [],
		reviewNotes: "Registro ilegible",
		reviewedAt: null,
		reviewedBy: null,
		createdAt: new Date("2026-11-01"),
		updatedAt: null,
		...overrides,
	}
}

describe("account document context in administrative reviews", () => {
	it("keeps a rejected company registration visible beside verified identity", () => {
		const signals = accountDocumentEvidenceSignals({
			holderType: "entidad",
			documents: [
				document(),
				document({ id: "identity", type: "government_id", status: "verified", reviewNotes: null }),
			],
		})
		expect(signals.find((s) => s.key === "identity_documents")?.status).toBe("pass")
		expect(signals.find((s) => s.key === "business_registration")).toMatchObject({
			status: "review",
			statusLabel: "Requiere cambios",
			detail: "registro.pdf · Registro ilegible",
		})
	})
	it("shows the required registration as missing even when no file exists", () => {
		expect(accountDocumentEvidenceSignals({ holderType: "entidad", documents: [] })).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "business_registration",
					status: "missing",
					statusLabel: "Falta",
				}),
			])
		)
	})
	it("does not invent a company registration requirement for a natural person", () => {
		expect(
			accountDocumentEvidenceSignals({
				holderType: "persona_natural",
				documents: [document()],
			}).map((s) => s.key)
		).toEqual(["identity_documents"])
	})
	it("preserves a verified predecessor while its replacement awaits review, like the provider portal", () => {
		const signals = accountDocumentEvidenceSignals({
			holderType: "entidad",
			documents: [
				document({
					id: "old",
					status: "verified",
					reviewNotes: null,
					createdAt: new Date("2026-10-01"),
				}),
				document({
					id: "new",
					status: "pending",
					fileName: "reemplazo.pdf",
					reviewNotes: null,
					createdAt: new Date("2026-11-02"),
				}),
			],
		})
		expect(signals.find((s) => s.key === "business_registration")).toMatchObject({
			status: "pass",
			statusLabel: "Verificado",
			detail: "registro.pdf",
		})
	})
})

it("classifies personal and business evidence independently", () => {
	const signals = accountDocumentEvidenceSignals({ holderType: "entidad", documents: [] })
	expect(signals.find((signal) => signal.key === "identity_documents")?.area).toBe("identity")
	expect(signals.find((signal) => signal.key === "business_registration")?.area).toBe("business")
})
