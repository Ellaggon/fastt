import { expect, it } from "vitest"
import { requiresTerritorialTransition } from "@/lib/commercial-policy/territorial-redesign-guard"

it("prevents standalone publication of pending territorial drafts", () => {
	const bundle = { publicationAuthorized: false, drafts: [{ id: "national-draft" }] }
	expect(requiresTerritorialTransition("national-draft", [bundle])).toBe(true)
	expect(requiresTerritorialTransition("other", [bundle])).toBe(false)
	expect(requiresTerritorialTransition("other", [null, {}, "invalid"])).toBe(false)
})
import {
	prepareTerritorialRedesign,
	territorialRedesignDefinitions,
} from "@/lib/commercial-policy/territorial-redesign"
import {
	evaluateCommercialPolicy,
	type CommercialPolicyVersion,
	type CommercialPolicyRequirement,
} from "@/lib/commercial-policy/evaluate"

const definitions = Object.fromEntries(
	territorialRedesignDefinitions().map((def) => [def.key, def.key])
)
const rule = (key: string, parts = ["credential"]): CommercialPolicyRequirement => ({
	key,
	required: true,
	capabilities: ["publish", "booking"],
	acceptedEvidence: [],
	documentAcceptance: {
		version: 1,
		alternatives: [{ id: "evidence", allOf: parts.map((id) => ({ definitionVersionId: id })) }],
	},
	condition: { evidenceScope: "product", evidenceSubjectSelector: "guides" },
	blockingAction: `Review ${key}`,
	reviewOwner: "reviewer",
	sourceKind: "fastt_policy",
	sourceReference: "Synthetic policy review",
	sourceCheckedAt: new Date("2026-01-01"),
})
function fixture() {
	const versions: (CommercialPolicyVersion & { policySetId: string })[] = []
	for (const holder of ["entidad", "persona_natural"] as const) {
		const make = (
			id: string,
			role: "product" | "holder" | "tax",
			family?: "tourism" | "operational_resources" | "platform_standards"
		) => ({
			id: `${holder}-${id}`,
			policySetId: `${holder}-${id}`,
			jurisdictionRole: role,
			country: "BO",
			vertical: "tour" as const,
			holderType: holder,
			collectionModel: "property_collect" as const,
			status: "published" as const,
			effectiveFrom: new Date("2026-01-01"),
			effectiveTo: null,
			approvedBy: "reviewer",
			approvedAt: new Date("2026-01-01"),
			approvalReference: "Signed test",
			signatures: (["policy", "finance", "tour_operations"] as const).map((approvalArea) => ({
				approvalArea,
				approverUserId: approvalArea,
				approvalReference: "Signed test",
				approvedAt: new Date("2026-01-01"),
			})),
			context: {
				contextVersion: family ? 3 : 2,
				experienceFormats: ["guided_tour" as const],
				jurisdictionCodes: ["lp"],
				operatingRoles: [holder === "entidad" ? "operator" : "guide"],
				activityClasses: ["urban_cultural"],
				executionModes: [holder === "entidad" ? "team" : "self"],
				foodHandlingModes: ["none"],
				...(family
					? {
							composition: {
								kind: "requirements" as const,
								family,
								requiredFamilies: [],
								replacesVersionIds: [],
							},
						}
					: {}),
			},
			requirements: [rule(id)],
		})
		for (const role of ["holder", "tax"] as const) {
			const v = make(role, role)
			v.requirements[0].condition = { evidenceScope: "provider", evidenceSubjectSelector: "holder" }
			versions.push(v)
		}
		const standard = make("standards", "product", "platform_standards")
		standard.requirements = [rule("standards", ["safety", "insurance"])]
		versions.push(standard)
		if (holder === "persona_natural") {
			versions.push(
				make("tourism", "product", "tourism"),
				make("resources", "product", "operational_resources")
			)
			const admission = make("admission", "product", "platform_standards")
			admission.context.composition = {
				kind: "admission" as never,
				family: "platform_standards",
				requiredFamilies: ["tourism", "operational_resources", "platform_standards"] as never,
				replacesVersionIds: [],
			}
			admission.requirements = []
			versions.push(admission)
		}
	}
	return versions
}

it("prepares seven unsigned changes without mutating any source", () => {
	const versions = fixture(),
		before = structuredClone(versions)
	const plan = prepareTerritorialRedesign({
		versions,
		countryTerritoryId: "bo",
		definitionIds: definitions,
	})
	expect(plan.drafts).toHaveLength(7)
	expect(plan.definitions).toHaveLength(4)
	expect(plan.publicationAuthorized).toBe(false)
	expect(versions).toEqual(before)
	for (const draft of plan.drafts.filter((p) => !p.context.composition)) {
		expect(draft.context.jurisdictionCodes).toEqual(["bo"])
		expect(draft.context.executionModes).toEqual([])
		expect(draft.context.foodHandlingModes).toEqual([])
		expect(draft.context.experienceFormats).toContain("workshop")
	}
	const entity = plan.drafts.find((p) => p.baseVersionId === "entidad-holder")!
	expect(entity.domain).toBe("verification")
	expect(plan.drafts.filter((p) => p.baseVersionId.endsWith("-tax")).map((p) => p.domain)).toEqual([
		"fiscal",
		"fiscal",
	])
	expect(entity.requirements).toHaveLength(2)
	expect(
		entity.requirements.map(
			(r) => r.documentAcceptance!.alternatives[0].allOf[0].definitionVersionId
		)
	).toEqual(["bo.holder.entity_existence", "bo.holder.entity_representation"])
})

it("preserves safety and insurance as two independently blocking requirements", () => {
	const plan = prepareTerritorialRedesign({
		versions: fixture(),
		countryTerritoryId: "bo",
		definitionIds: definitions,
	})
	for (const draft of plan.drafts.filter((p) => p.label.startsWith("Seguridad"))) {
		expect(draft.context.jurisdictionCodes).toEqual(["lp"])
		expect(draft.requirements).toHaveLength(2)
		expect(draft.requirements.every((r) => r.required && r.capabilities.includes("booking"))).toBe(
			true
		)
		expect(
			draft.requirements.flatMap((r) =>
				r.documentAcceptance!.alternatives[0].allOf.map((d) => d.definitionVersionId)
			)
		).toEqual(["safety", "insurance"])
	}
})

it("removes only the confirmed guide duplicate, keeping admission local", () => {
	const versions = fixture(),
		plan = prepareTerritorialRedesign({
			versions,
			countryTerritoryId: "bo",
			definitionIds: definitions,
		})
	const admission = plan.drafts.find((p) => p.baseVersionId === "persona_natural-admission")!
	expect(admission.context.jurisdictionCodes).toEqual(["lp"])
	expect(admission.context.composition!.requiredFamilies).not.toContain("tourism")
	expect(admission.context.composition!.requiredFamilies).toContain("operational_resources")
	expect(admission.retireAfterPublication).toEqual(["persona_natural-tourism"])
	versions.find((v) => v.id === "persona_natural-resources")!.requirements[0].capabilities = [
		"publish",
	]
	expect(() =>
		prepareTerritorialRedesign({ versions, countryTerritoryId: "bo", definitionIds: definitions })
	).toThrow("guide_rules_not_equivalent")
})

it("national identity and tax cannot admit Santa Cruz or another product format", () => {
	const versions = fixture(),
		plan = prepareTerritorialRedesign({
			versions,
			countryTerritoryId: "bo",
			definitionIds: definitions,
		})
	const national = plan.drafts
		.filter((p) => p.baseVersionId.startsWith("persona_natural") && !p.context.composition)
		.map((draft) => ({
			...versions.find((v) => v.id === draft.baseVersionId)!,
			id: `national-${draft.baseVersionId}`,
			context: draft.context,
			requirements: draft.requirements,
		}))
	const evidence = Object.values(definitions).map((definitionVersionId) => ({
		id: definitionVersionId,
		definitionVersionId,
		type: "synthetic",
		status: "verified" as const,
		subjectType: "provider" as const,
		subjectReference: "provider",
		scopes: [],
	}))
	for (const format of ["guided_tour", "workshop"] as const) {
		const result = evaluateCommercialPolicy({
			versions: [...national, ...versions.filter((v) => v.jurisdictionRole === "product")],
			now: new Date("2026-11-18"),
			evidence,
			context: {
				vertical: "tour",
				holderType: "persona_natural",
				holderCountry: "BO",
				taxCountry: "BO",
				payoutCountry: null,
				productCountry: "BO",
				providerId: "provider",
				subjectReferences: ["provider"],
				evidenceSubjects: { holder: ["provider"] },
				collectionModel: "property_collect",
				experienceFormat: format,
				operatingRole: "guide",
				activityClasses: ["urban_cultural"],
				jurisdictionCode: "sc",
				jurisdictionCodes: ["sc"],
				territoryAncestors: { sc: ["sc", "bo"] },
			},
		})
		expect(result.policyVersionIds).toEqual(expect.arrayContaining(national.map((v) => v.id)))
		expect(result.capabilities).toMatchObject({ publish: false, booking: false })
		expect(result.blockers.map((b) => b.id)).toContain("policy_context_unsupported_product")
	}
})
