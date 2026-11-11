import { expect, it } from "vitest"
import { prepareLaPazPolicyForms } from "@/lib/commercial-policy/la-paz-policy-forms"
import { prepareLaPazReviewPackage } from "@/lib/commercial-policy/la-paz-review-package"

it("prepares eighteen drafts and sixteen rules with complete stable references", () => {
	const mapping = new Map(prepareLaPazReviewPackage().definitions.map((d, i) => [d.key, `definition-${i}`]))
	const drafts = prepareLaPazPolicyForms("2026-11-09", mapping)
	expect(drafts).toHaveLength(18)
	expect(drafts.filter(d => d.rule)).toHaveLength(16)
	expect(new Set(drafts.map(d => d.form.get("policyCode"))).size).toBe(18)
	for (const { form, rule } of drafts) {
		expect(form.getAll("jurisdictionCodes")).toEqual(["geo:bo:la-paz-department"])
		if (!rule) { expect(form.getAll("requiredFamilies")).toHaveLength(6); continue }
		expect(rule.get("sourceReference")).not.toContain("SYNTHETIC")
		expect(rule.getAll("alternative.0").every(id => [...mapping.values()].includes(String(id)))).toBe(true)
		expect(rule.getAll("capabilities")).toEqual(["publish", "booking"])
	}
})
it("rejects incomplete mappings and invalid dates before any persistence", () => {
	expect(() => prepareLaPazPolicyForms("2026-11-09", new Map())).toThrow("la_paz_definition_mapping_incomplete")
	expect(() => prepareLaPazPolicyForms("invalid", new Map())).toThrow()
})
