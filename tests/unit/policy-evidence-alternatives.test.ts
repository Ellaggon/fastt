import { describe, expect, it } from "vitest"
import { parseEvidenceAlternatives } from "@/lib/commercial-policy/evidence-alternatives"

describe("policy evidence alternative form", () => {
	it("preserves AND inside a package and OR across alternatives", () => {
		const form = new FormData()
		form.append("alternative.0", "identity:1")
		form.append("alternative.0", "representation:2")
		form.append("alternative.3", "combined:1")
		expect(parseEvidenceAlternatives(form).alternatives).toEqual([
			{
				id: "alternative-1",
				allOf: [{ definitionVersionId: "identity:1" }, { definitionVersionId: "representation:2" }],
			},
			{ id: "alternative-4", allOf: [{ definitionVersionId: "combined:1" }] },
		])
	})
	it("rejects an empty or duplicated package", () => {
		expect(() => parseEvidenceAlternatives(new FormData())).toThrow()
		const form = new FormData()
		form.append("alternative.0", "identity:1")
		form.append("alternative.0", "identity:1")
		expect(() => parseEvidenceAlternatives(form)).toThrow()
	})
})
