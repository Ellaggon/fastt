import { z } from "zod"
import { prepareLaPazReviewPackage } from "./la-paz-review-package"

/** Administrative draft payloads; effective date is provisional until ratification. */
export function prepareLaPazPolicyForms(effectiveFrom: string, definitions: Map<string, string>) {
	z.iso.date().parse(effectiveFrom)
	const review = prepareLaPazReviewPackage()
	for (const definition of review.definitions)
		if (!definitions.get(definition.key)) throw new Error("la_paz_definition_mapping_incomplete")
	const families = [
		"identity",
		"fiscal",
		"tourism",
		"regulated_place",
		"operational_resources",
		"platform_standards",
	]
	const result: { form: FormData; rule: FormData | null }[] = []
	for (const team of [true, false]) {
		const base = {
			country: "BO",
			holderType: team ? "entidad" : "persona_natural",
			effectiveFrom,
			effectiveTo: "",
			jurisdictionCodes: ["geo:bo:la-paz-department"],
			legalFormCodes: [team ? "BO:company" : "BO:individual"],
			operatingRoles: [team ? "operator" : "guide"],
			executionModes: [team ? "team" : "self"],
			foodHandlingModes: ["none"],
			transportProviders: [],
			activityClasses: ["urban_cultural"],
			experienceFormats: ["guided_tour"],
		}
		const groups = [
			{ role: "product", family: "platform_standards", admission: true },
			...families.map((family) => ({ role: "product", family, admission: false })),
			{ role: "holder", family: "identity", admission: false },
			{ role: "tax", family: "fiscal", admission: false },
		]
		for (const group of groups) {
			const form = new FormData()
			for (const [key, value] of Object.entries(base))
				if (Array.isArray(value)) for (const item of value) form.append(key, item)
				else form.set(key, value)
			form.set("jurisdictionRole", group.role)
			form.set(
				"policyCode",
				`la_paz_urban_${team ? "team" : "self"}_${group.role}_${group.admission ? "admission" : group.family}_v1`
			)
			if (group.role === "product") {
				form.set("contractMode", "composable")
				form.set("policyKind", group.admission ? "admission" : "requirements")
				form.set("policyFamily", group.family)
				if (group.admission) for (const family of families) form.append("requiredFamilies", family)
			}
			if (group.admission) {
				result.push({ form, rule: null })
				continue
			}
			const guide =
				group.family === "operational_resources" || (group.family === "tourism" && !team)
			const keys =
				group.family === "tourism"
					? guide
						? review.ruleDefinitions.tourismGuide
						: review.ruleDefinitions.tourismOperator
					: review.ruleDefinitions[group.family as keyof typeof review.ruleDefinitions]
			const rule = new FormData()
			for (const [key, value] of Object.entries({
				requirementKey: `la_paz.${group.role}.${group.family}`,
				domain: "documents",
				evidenceMode: "versioned",
				evidenceSubjectSelector: guide
					? "guides"
					: group.family === "tourism"
						? "operator"
						: "holder",
				evidenceScope: ["identity", "fiscal"].includes(group.family) ? "provider" : "product",
				reviewOwner: "Responsable autorizado de Fastt",
				blockingAction: `Completar revision de ${group.family} con evidencia aplicable, vigente y del sujeto correcto.`,
				sourceKind: review.sourceKind,
				sourceReference: review.sourceReference,
				sourceCheckedAt: "2026-11-09",
			}))
				rule.set(key, value)
			for (const capability of ["publish", "booking"]) rule.append("capabilities", capability)
			for (const key of keys) rule.append("alternative.0", definitions.get(key)!)
			result.push({ form, rule })
		}
	}
	return result
}
