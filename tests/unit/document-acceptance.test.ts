import { describe, expect, it } from "vitest"
import {
	evaluateDocumentAcceptance,
	type DocumentAcceptance,
} from "../../src/shared/domain/document-acceptance"

const acceptance: DocumentAcceptance = {
	version: 1,
	alternatives: [
		{ id: "combined", allOf: [{ definitionVersionId: "a:1" }, { definitionVersionId: "b:1" }] },
		{ id: "single", allOf: [{ definitionVersionId: "c:1" }] },
	],
}
describe("document acceptance packages", () => {
	it("requires every component of a package", () => {
		expect(
			evaluateDocumentAcceptance(
				acceptance,
				["ana"],
				[{ id: "a", definitionVersionId: "a:1", subjectId: "ana" }]
			).satisfied
		).toBe(false)
	})
	it("accepts a complete alternative", () => {
		const result = evaluateDocumentAcceptance(
			acceptance,
			["ana"],
			[{ id: "c", definitionVersionId: "c:1", subjectId: "ana" }]
		)
		expect(result.subjects[0].satisfiedBy?.alternativeId).toBe("single")
	})
	it("never combines different subjects", () => {
		expect(
			evaluateDocumentAcceptance(
				acceptance,
				["ana", "luis"],
				[
					{ id: "a", definitionVersionId: "a:1", subjectId: "ana" },
					{ id: "b", definitionVersionId: "b:1", subjectId: "luis" },
				]
			).satisfied
		).toBe(false)
	})
	it("requires every declared subject and exact versions", () => {
		expect(
			evaluateDocumentAcceptance(
				acceptance,
				["ana", "luis"],
				[{ id: "c", definitionVersionId: "c:1", subjectId: "ana" }]
			).satisfied
		).toBe(false)
		expect(
			evaluateDocumentAcceptance(
				acceptance,
				["ana"],
				[{ id: "c", definitionVersionId: "c:2", subjectId: "ana" }]
			).satisfied
		).toBe(false)
	})
	it("does not treat an empty subject list as satisfied", () => {
		expect(evaluateDocumentAcceptance(acceptance, [], []).satisfied).toBe(false)
	})
	it("rejects empty alternatives", () => {
		expect(() =>
			evaluateDocumentAcceptance(
				{ version: 1, alternatives: [{ id: "empty", allOf: [] }] },
				["ana"],
				[]
			)
		).toThrow("invalid_document_acceptance")
	})
})
