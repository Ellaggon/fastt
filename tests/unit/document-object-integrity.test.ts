import { expect, it } from "vitest"
import { documentIntegrity, assertDocumentIntegrity } from "@/lib/documents/object-integrity"
import { buildProviderDocumentObjectKey, parseProviderDocumentObjectKey } from "@/lib/provider-document-storage"
it("computes size and hash from bytes rather than submitted metadata",()=>{
	const bytes=Buffer.from("synthetic")
	const integrity=documentIntegrity(bytes,"application/pdf")
	expect(integrity.byteSize).toBe(9)
	expect(integrity.sha256).toHaveLength(64)
	expect(()=>assertDocumentIntegrity(bytes,integrity)).not.toThrow()
	expect(()=>assertDocumentIntegrity(Buffer.from("changed"),integrity)).toThrow("document_integrity_mismatch")
})
it("does not manufacture historical hashes and rejects malformed contracts",()=>{
	expect(()=>assertDocumentIntegrity(Buffer.from("old"),undefined)).not.toThrow()
	expect(()=>assertDocumentIntegrity(Buffer.from("old"),{})).toThrow("document_integrity_invalid")
})
it("does not expose the original filename and rejects URL/path injection",()=>{
	expect(buildProviderDocumentObjectKey({providerId:"owner",documentId:"doc",fileName:"passport-123456.pdf"})).toBe("provider-documents/owner/doc/original")
	for(const suffix of ["../secret","original?signature=secret","original#fragment","%2e%2e"])
		expect(parseProviderDocumentObjectKey(`r2-documents:provider-documents/owner/doc/${suffix}`)).toBeNull()
	expect(()=>buildProviderDocumentObjectKey({providerId:"../other",documentId:"doc",fileName:"a.pdf"})).toThrow()
})
