import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { inferDocumentMimeType, validateDocumentFile } from "@/lib/provider-documents"
import { readVerificationSurface } from "./read-verification-surface"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("provider document mime inference + storage", () => {
	it("infers application/pdf when browser sends empty File.type", () => {
		expect(
			inferDocumentMimeType({ mimeType: null, fileName: "SERVICIO DE REGISTRO.pdf" })
		).toBe("application/pdf")
		expect(inferDocumentMimeType({ mimeType: "", fileName: "id.JPG" })).toBe("image/jpeg")
		expect(
			inferDocumentMimeType({ mimeType: "application/octet-stream", fileName: "doc.pdf" })
		).toBe("application/pdf")
	})

	it("validateDocumentFile recovers mime from extension", () => {
		const file = new File([new Uint8Array([1, 2, 3, 4])], "SERVICIO DE REGISTRO.pdf", {
			type: "",
		})
		const meta = validateDocumentFile(file)
		expect(meta?.fileName).toBe("SERVICIO DE REGISTRO.pdf")
		expect(meta?.mimeType).toBe("application/pdf")
		expect(meta?.sizeBytes).toBe(4)
	})

	it("wires R2 upload with Buffer body and local fallback path", () => {
		const lib = read("src/lib/provider-documents.ts")
		const storage = read("src/lib/provider-document-storage.ts")
		expect(lib).toContain("inferDocumentMimeType")
		expect(lib).toContain("document_storage_upload_failed")
		expect(lib).toContain("allowLegacyLocalDocumentUrls")
		expect(storage).toContain("Buffer.from")
		expect(storage).toContain("NODE_ENV !== \"production\"")
	})

	it("verification page maps upload error codes", () => {
		const page = readVerificationSurface("src/pages/provider/settings/verification.astro")
		expect(page).toContain("uploadErrorMessages")
		expect(page).toContain("document_file_meta_required")
		expect(page).toContain("document_storage_upload_failed")
	})
})
