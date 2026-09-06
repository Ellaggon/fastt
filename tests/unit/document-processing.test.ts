import { describe, expect, it } from "vitest"

import {
	documentInspectionGate,
	inspectDocumentStructure,
	type ProviderDocumentInspectionReadModel,
} from "@/lib/documents/document-processing"

function inspection(
	partial: Partial<ProviderDocumentInspectionReadModel> = {}
): ProviderDocumentInspectionReadModel {
	return {
		processingState: "completed",
		structuralStatus: "valid",
		malwareStatus: "clean",
		ocrStatus: "completed",
		extractionStatus: "completed",
		tamperStatus: "clear",
		detectedMimeType: "application/pdf",
		sha256: "a".repeat(64),
		ocrConfidence: 0.99,
		extractedFieldKeys: ["legal_name"],
		errorCode: null,
		updatedAt: new Date("2026-09-05T00:00:00Z"),
		...partial,
	}
}

describe("provider document processing", () => {
	it("recognizes a structurally valid PDF by bytes, not its declared extension", () => {
		const result = inspectDocumentStructure(
			Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"),
			"application/pdf"
		)
		expect(result.detectedMimeType).toBe("application/pdf")
		expect(result.structuralStatus).toBe("valid")
	})

	it("blocks MIME spoofing and active PDF content", () => {
		const spoofed = inspectDocumentStructure(
			Buffer.from([0xff, 0xd8, 0xff, 0x00]),
			"application/pdf"
		)
		expect(spoofed.structuralStatus).toBe("invalid")
		const active = inspectDocumentStructure(
			Buffer.from("%PDF-1.4\n/JavaScript /OpenAction\n%%EOF"),
			"application/pdf"
		)
		expect(active.structuralStatus).toBe("suspicious")
		expect(active.signals).toContain("pdf_javascript")
	})

	it("never treats an unavailable antivirus as clean when enforcement is enabled", () => {
		const gate = documentInspectionGate(inspection({ malwareStatus: "unavailable" }), {
			enforced: true,
		})
		expect(gate.canReveal).toBe(false)
		expect(gate.blockers.join(" ")).toContain("antivirus")
	})

	it("keeps OCR failure reviewable but requires a documented manual review", () => {
		const gate = documentInspectionGate(
			inspection({ ocrStatus: "error", extractionStatus: "error" }),
			{ enforced: true }
		)
		expect(gate.blockers).toEqual([])
		expect(gate.warnings).toHaveLength(2)
		expect(gate.canReveal).toBe(true)
	})

	it("blocks malware and manipulation independent of rollout mode", () => {
		for (const unsafe of [
			inspection({ malwareStatus: "infected" }),
			inspection({ tamperStatus: "suspected" }),
		]) {
			const gate = documentInspectionGate(unsafe, { enforced: false })
			expect(gate.canReveal).toBe(false)
			expect(gate.blockers.length).toBeGreaterThan(0)
		}
	})
})
