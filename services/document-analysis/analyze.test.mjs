import { test } from "node:test"
import assert from "node:assert/strict"
import { validateAnalysisRequest } from "./analyze.mjs"

const config = {
	sourceOrigin: "https://private.r2.cloudflarestorage.com",
	sourcePathPrefix: "/provider-documents/",
}
const input = {
	documentId: "doc",
	sha256: "a".repeat(64),
	mimeType: "application/pdf",
	sourceUrl: `${config.sourceOrigin}/provider-documents/provider/doc/original?X-Amz-Signature=synthetic`,
}
test("accepts only the configured signed origin and document path", () => {
	assert.equal(validateAnalysisRequest(input, config).origin, config.sourceOrigin)
})
test("rejects SSRF, alternate ports, credentials, unbound objects and unsigned sources", () => {
	for (const sourceUrl of [
		"http://127.0.0.1/metadata",
		"https://169.254.169.254/metadata",
		input.sourceUrl.replace("https://", "https://user:secret@"),
		input.sourceUrl.replace(".com/", ".com:444/"),
		input.sourceUrl.replace("/doc/", "/other/"),
		input.sourceUrl.split("?")[0],
		input.sourceUrl + "#fragment",
	])
		assert.throws(() => validateAnalysisRequest({ ...input, sourceUrl }, config))
})
test("rejects invalid hashes, identifiers and unsupported formats before downloading", () => {
	for (const change of [{ sha256: "invalid" }, { documentId: "../doc" }, { mimeType: "text/html" }])
		assert.throws(() => validateAnalysisRequest({ ...input, ...change }, config))
})
