import { expect, it } from "vitest"
import { prepareLaPazPolicyForms } from "@/lib/commercial-policy/la-paz-policy-forms"
import { prepareLaPazReviewPackage } from "@/lib/commercial-policy/la-paz-review-package"

it("confirms the three independent-guide duplicates and removes only holder duplicates in the first proposal", () => {
	const mapping = new Map(
		prepareLaPazReviewPackage().definitions.map((definition) => [definition.key, definition.key])
	)
	const guideForms = (reuseGuideProviderPolicies = false) =>
		prepareLaPazPolicyForms("2026-11-09", mapping, { reuseGuideProviderPolicies }).filter(
			({ form }) => form.get("holderType") === "persona_natural"
		)
	const original = guideForms()
	const ruleFor = (key: string) =>
		original.find(({ rule }) => rule?.get("requirementKey") === key)!.rule!
	const signature = (key: string) => {
		const rule = ruleFor(key)
		return ["evidenceSubjectSelector", "evidenceScope", "alternative.0", "capabilities"].map(
			(field) => rule.getAll(field)
		)
	}
	for (const [left, right] of [
		["holder.identity", "product.identity"],
		["tax.fiscal", "product.fiscal"],
		["product.tourism", "product.operational_resources"],
	])
		expect(signature(`la_paz.${left}`)).toEqual(signature(`la_paz.${right}`))
	const proposed = guideForms(true)
	expect(proposed).toHaveLength(7)
	expect(proposed.find(({ rule }) => !rule)?.form.getAll("requiredFamilies")).toEqual([
		"tourism",
		"regulated_place",
		"operational_resources",
		"platform_standards",
	])
	expect(
		proposed.filter(({ rule }) => rule).map(({ rule }) => rule?.get("requirementKey"))
	).toEqual([
		"la_paz.product.tourism",
		"la_paz.product.regulated_place",
		"la_paz.product.operational_resources",
		"la_paz.product.platform_standards",
		"la_paz.holder.identity",
		"la_paz.tax.fiscal",
	])
})

it("prepares eighteen drafts and sixteen rules with complete stable references", () => {
	const mapping = new Map(
		prepareLaPazReviewPackage().definitions.map((d, i) => [d.key, `definition-${i}`])
	)
	const drafts = prepareLaPazPolicyForms("2026-11-09", mapping)
	expect(drafts).toHaveLength(18)
	expect(drafts.filter((d) => d.rule)).toHaveLength(16)
	expect(new Set(drafts.map((d) => d.form.get("policyCode"))).size).toBe(18)
	for (const { form, rule } of drafts) {
		expect(form.getAll("jurisdictionCodes")).toEqual(["geo:bo:la-paz-department"])
		if (!rule) {
			expect(form.getAll("requiredFamilies")).toHaveLength(6)
			continue
		}
		expect(rule.get("sourceReference")).not.toContain("SYNTHETIC")
		expect(
			rule.getAll("alternative.0").every((id) => [...mapping.values()].includes(String(id)))
		).toBe(true)
		expect(rule.getAll("capabilities")).toEqual(["publish", "booking"])
	}
})
it("rejects incomplete mappings and invalid dates before any persistence", () => {
	expect(() => prepareLaPazPolicyForms("2026-11-09", new Map())).toThrow(
		"la_paz_definition_mapping_incomplete"
	)
	expect(() => prepareLaPazPolicyForms("invalid", new Map())).toThrow()
})

it("prepares seven team policies without changing the independent guide package", () => {
	const mapping = new Map(
		prepareLaPazReviewPackage().definitions.map((definition) => [definition.key, definition.key])
	)
	const drafts = prepareLaPazPolicyForms("2026-11-09", mapping, {
		reuseTeamProviderPolicies: true,
	})
	const team = drafts.filter(({ form }) => form.get("holderType") === "entidad")
	expect(team).toHaveLength(7)
	expect(drafts).toHaveLength(16)
	expect(team.find(({ rule }) => !rule)?.form.getAll("requiredFamilies")).toEqual([
		"tourism",
		"regulated_place",
		"operational_resources",
		"platform_standards",
	])
	expect(
		team
			.filter(({ form }) => form.get("jurisdictionRole") !== "product")
			.map(({ rule }) => rule?.get("requirementKey"))
	).toEqual(["la_paz.holder.identity", "la_paz.tax.fiscal"])
})
