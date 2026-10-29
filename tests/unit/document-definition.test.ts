import { describe, expect, it } from "vitest"
import {
	documentCaptureSchema,
	validateDocumentCapture,
} from "../../src/shared/domain/document-definition"

const capture = documentCaptureSchema.parse({
	version: 1,
	issuer: "required",
	issuedAt: "optional",
	expiresAt: "required",
	allowedSubjectTypes: ["person"],
	issuerCountries: [],
	requiredScopes: ["product"],
})
const valid = {
	issuer: "Authority",
	issuedAt: new Date("2026-01-01"),
	expiresAt: new Date("2027-01-01"),
	subjectType: "person",
	subjectReference: "guide-ana",
	scopeTypes: ["product"],
}
describe("document definition capture", () => {
	it("accepts the configured subject and fields", () =>
		expect(() => validateDocumentCapture(capture, valid)).not.toThrow())
	it("rejects missing subject and required fields", () => {
		expect(() => validateDocumentCapture(capture, { ...valid, subjectReference: null })).toThrow(
			"document_subject_required"
		)
		expect(() => validateDocumentCapture(capture, { ...valid, expiresAt: null })).toThrow(
			"document_expiresAt_required"
		)
	})
	it("rejects another subject category and insufficient scope", () => {
		expect(() => validateDocumentCapture(capture, { ...valid, subjectType: "provider" })).toThrow(
			"document_subject_not_allowed"
		)
		expect(() => validateDocumentCapture(capture, { ...valid, scopeTypes: [] })).toThrow(
			"document_scope_required"
		)
	})
	it("rejects reversed validity and arbitrary executable configuration", () => {
		expect(() =>
			validateDocumentCapture(capture, { ...valid, issuedAt: new Date("2028-01-01") })
		).toThrow("document_invalid_dates")
		expect(() => documentCaptureSchema.parse({ ...capture, script: "return true" })).toThrow()
	})
})
