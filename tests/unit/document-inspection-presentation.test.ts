import { expect, it } from "vitest"
import { documentTechnicalPresentation } from "@/lib/documents/inspection-presentation"
import {
	documentInspectionGate,
	type ProviderDocumentInspectionReadModel,
} from "@/lib/documents/document-processing"

it("keeps UI review readiness aligned with the server inspection gate", () => {
	const base: ProviderDocumentInspectionReadModel = {
		processingState: "completed",
		structuralStatus: "valid",
		malwareStatus: "clean",
		tamperStatus: "clear",
		ocrStatus: "completed",
		extractionStatus: "completed",
		detectedMimeType: "application/pdf",
		sha256: "a".repeat(64),
		ocrConfidence: null,
		extractedFieldKeys: [],
		errorCode: null,
		updatedAt: new Date(),
	}
	for (const processingState of [
		"completed",
		"queued",
		"processing",
		"blocked",
		"awaiting_configuration",
		"failed",
	])
		for (const malwareStatus of ["clean", "infected", "pending", "error"])
			for (const structuralStatus of ["valid", "invalid", "suspicious", "pending", "error"])
				for (const tamperStatus of ["clear", "inconclusive", "suspected", "pending", "error"]) {
					const state = { ...base, processingState, malwareStatus, structuralStatus, tamperStatus }
					expect(documentTechnicalPresentation(state).ready).toBe(
						documentInspectionGate(state).canReveal
					)
				}
	expect(documentTechnicalPresentation(null).ready).toBe(false)
})
