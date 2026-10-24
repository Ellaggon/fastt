import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
	preview: "ready",
	warnings: [] as string[],
	blockers: [] as string[],
	expiresAt: null as Date | null,
	update: vi.fn(),
}))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()),
	db: {
		select: () => ({
			from: () => ({
				where: () =>
					Promise.resolve([
						{
							id: "document-a",
							providerId: "provider-a",
							status: "pending",
							fileUrl: "r2://document-a",
							expiresAt: state.expiresAt,
						},
					]),
			}),
		}),
		update: state.update,
	},
}))
vi.mock("@/lib/provider-document-storage", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/provider-document-storage")>()),
	inspectProviderDocumentPreview: async () => ({ state: state.preview }),
}))
vi.mock("@/lib/documents/document-processing", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/documents/document-processing")>()),
	getProviderDocumentInspection: async () => null,
	documentInspectionGate: () => ({ blockers: state.blockers, warnings: state.warnings }),
}))
import { reviewProviderDocument } from "@/lib/provider-documents"
const input = {
	providerId: "provider-a",
	actorUserId: "reviewer-a",
	documentId: "document-a",
	status: "verified",
}

describe("document approval requires reviewable evidence", () => {
	beforeEach(() => {
		state.preview = "ready"
		state.warnings = []
		state.blockers = []
		state.expiresAt = null
		state.update.mockReset()
	})
	it("rejects an unavailable original before changing its status", async () => {
		state.preview = "unavailable"
		await expect(reviewProviderDocument(input)).rejects.toMatchObject({
			message: "document_preview_required",
			status: 422,
		})
		expect(state.update).not.toHaveBeenCalled()
	})
	it("requires notes for manual approval when automated checks are incomplete", async () => {
		state.warnings = ["OCR unavailable"]
		await expect(reviewProviderDocument(input)).rejects.toMatchObject({
			message: "document_manual_review_notes_required",
			status: 422,
		})
		expect(state.update).not.toHaveBeenCalled()
	})
	it("keeps failed security checks blocking approval", async () => {
		state.blockers = ["Malware detected"]
		await expect(reviewProviderDocument(input)).rejects.toMatchObject({
			message: "document_processing_gate_blocked",
			status: 422,
		})
		expect(state.update).not.toHaveBeenCalled()
	})
	it("keeps expired evidence out of the approval path", async () => {
		state.expiresAt = new Date("2000-01-01T00:00:00Z")
		await expect(reviewProviderDocument(input)).rejects.toMatchObject({
			message: "document_expired",
			status: 422,
		})
		expect(state.update).not.toHaveBeenCalled()
	})
})
