import { describe, expect, it } from "vitest"
import {
	documentReuseSchema,
	validateDocumentReuse,
} from "../../src/lib/documents/document-reuse-contract"

const input = documentReuseSchema.parse({
	providerId: "provider-a",
	documentId: "document-a",
	definitionVersionId: "fe592516-33c2-4d94-95b2-a60938838f98",
	subjectType: "person",
	subjectReference: "person-a",
	issuer: "Emisor de prueba",
	issuedAt: "2025-01-01",
	expiresAt: "2027-01-01",
	reason: "Revisar identidad del titular",
})
const source = {
	providerId: "provider-a",
	status: "verified",
	type: "government_id",
	fileUrl: "r2:private/document",
	expiresAt: new Date("2027-01-01"),
}
const definition = {
	key: "bo.holder.personal_identity",
	family: "identity",
	status: "published",
	captureJson: {
		version: 1,
		issuer: "required",
		issuedAt: "required",
		expiresAt: "optional",
		allowedSubjectTypes: ["person"],
		issuerCountries: [],
		requiredScopes: [],
	},
}
const now = new Date("2026-01-01")
describe("reuse requires a fresh document review", () => {
	it("validates capture without changing the source approval", () => {
		const before = structuredClone(source)
		expect(validateDocumentReuse(input, source, definition, now)).toBe(input)
		expect(source).toEqual(before)
	})
	it.each(["pending", "rejected", "superseded"])("rejects source status %s", (status) => {
		expect(() => validateDocumentReuse(input, { ...source, status }, definition, now)).toThrow(
			"verified_document_required"
		)
	})
	it("rejects another provider", () =>
		expect(() =>
			validateDocumentReuse(input, { ...source, providerId: "other" }, definition, now)
		).toThrow("verified_document_required"))
	it("rejects expired evidence", () =>
		expect(() =>
			validateDocumentReuse(
				input,
				{ ...source, expiresAt: new Date("2024-01-01") },
				definition,
				now
			)
		).toThrow("document_expired"))
	it("does not extend a known expiry", () =>
		expect(() =>
			validateDocumentReuse({ ...input, expiresAt: null }, source, definition, now)
		).toThrow("document_expiry_cannot_be_extended"))
	it("does not accept an unpublished definition", () =>
		expect(() =>
			validateDocumentReuse(input, source, { ...definition, status: "draft" }, now)
		).toThrow("document_definition_not_published"))
	it("does not turn a personal ID into representation", () =>
		expect(() =>
			validateDocumentReuse(
				input,
				source,
				{ ...definition, key: "bo.holder.entity_representation" },
				now
			)
		).toThrow("document_family_mismatch"))
	it("requires the correct subject type", () =>
		expect(() =>
			validateDocumentReuse(
				{ ...input, subjectType: "provider", subjectReference: input.providerId },
				source,
				definition,
				now
			)
		).toThrow("document_subject_not_allowed"))
	it("does not carry operational scopes into a national review", () =>
		expect(() =>
			validateDocumentReuse(
				input,
				source,
				{ ...definition, captureJson: { ...definition.captureJson, requiredScopes: ["product"] } },
				now
			)
		).toThrow("document_reuse_scope_review_required"))
	it("requires explicit attribution", () =>
		expect(() => documentReuseSchema.parse({ ...input, subjectReference: "" })).toThrow())
})
