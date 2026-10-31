import { expect, it } from "vitest"
import { documentStorageConfig } from "@/lib/documents/storage-config"
const privateEnv = {R2_DOCUMENTS_ACCOUNT_ID:"account",R2_DOCUMENTS_BUCKET_NAME:"private",R2_DOCUMENTS_ACCESS_KEY_ID:"private-key",R2_DOCUMENTS_SECRET_ACCESS_KEY:"private-secret"}
it("does not fall back to asset configuration", () => {
	expect(documentStorageConfig({R2_ACCOUNT_ID:"account",R2_BUCKET_NAME:"public",R2_ACCESS_KEY_ID:"key",R2_SECRET_ACCESS_KEY:"secret"})).toBeNull()
})
it("allows separate credentials and bucket in the same account", () => {
	expect(documentStorageConfig({...privateEnv,R2_ACCOUNT_ID:"account",R2_BUCKET_NAME:"public",R2_ACCESS_KEY_ID:"public-key"})?.bucket).toBe("private")
})
it("rejects shared buckets or credentials", () => {
	expect(() => documentStorageConfig({...privateEnv,R2_ACCOUNT_ID:"account",R2_BUCKET_NAME:"private"})).toThrow("document_bucket_must_be_separate")
	expect(() => documentStorageConfig({...privateEnv,R2_ACCESS_KEY_ID:"private-key"})).toThrow("document_credentials_must_be_separate")
})
