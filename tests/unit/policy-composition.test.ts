import { describe, expect, it } from "vitest"
import {
	composePolicyVersions,
	compositionSchema,
	type PolicyComposition,
} from "@/lib/commercial-policy/composition"
import {
	evaluateCommercialPolicy,
	type CommercialPolicyVersion,
} from "@/lib/commercial-policy/evaluate"

const contract = (
	kind: PolicyComposition["kind"],
	family: PolicyComposition["family"] = "tourism",
	replacesVersionIds: string[] = []
): PolicyComposition => ({
	kind,
	family,
	requiredFamilies: kind === "admission" ? ["tourism"] : [],
	replacesVersionIds,
})
const candidate = (id: string, composition: PolicyComposition, policySetId = id) => ({
	id,
	composition,
	policySetId,
})
describe("explicit policy composition", () => {
	it("accumulates compatible families and preserves their identities", () => {
		const result = composePolicyVersions([
			candidate("admission", contract("admission")),
			candidate("tourism", contract("requirements")),
			candidate("safety", contract("requirements", "specialized_activity")),
		])
		expect(result.conflicts).toEqual([])
		expect(result.selectedIds).toEqual(["admission", "tourism", "safety"])
	})
	it("distinguishes missing coverage from missing admission", () => {
		expect(
			composePolicyVersions([candidate("admission", contract("admission"))]).missingFamilies
		).toEqual(["tourism"])
		expect(
			composePolicyVersions([candidate("tourism", contract("requirements"))]).conflicts
		).toContain("admission_not_unique")
	})
	it("replaces only explicit compatible targets", () => {
		const result = composePolicyVersions([
			candidate("a", contract("admission")),
			candidate("old", contract("requirements")),
			candidate("new", contract("requirements", "tourism", ["old"])),
		])
		expect(result.selectedIds).toEqual(["a", "new"])
		expect(result.replacements).toEqual([{ versionId: "old", replacedByVersionId: "new" }])
	})
	it("rejects cycles, missing targets and competing successors", () => {
		expect(
			composePolicyVersions([
				candidate("a", contract("requirements", "tourism", ["b"])),
				candidate("b", contract("requirements", "tourism", ["a"])),
			]).conflicts
		).toContain("replacement_cycle:a")
		expect(
			composePolicyVersions([candidate("a", contract("requirements", "tourism", ["absent"]))])
				.conflicts
		).toContain("invalid_replacement:a:absent")
		expect(
			composePolicyVersions([
				candidate("old", contract("requirements")),
				candidate("a", contract("requirements", "tourism", ["old"])),
				candidate("b", contract("requirements", "tourism", ["old"])),
			]).conflicts
		).toContain("competing_replacement:old")
	})
	it("does not implicitly prioritize versions or cross-family replacements", () => {
		expect(
			composePolicyVersions([
				candidate("a", contract("requirements"), "same"),
				candidate("b", contract("requirements"), "same"),
			]).conflicts
		).toContain("concurrent_versions:same")
		expect(
			composePolicyVersions([
				candidate("a", contract("requirements")),
				candidate("b", contract("requirements", "identity", ["a"])),
			]).conflicts
		).toContain("invalid_replacement:b:a")
	})
	it("rejects empty admission and duplicate replacement declarations", () => {
		expect(
			compositionSchema.safeParse({ ...contract("admission"), requiredFamilies: [] }).success
		).toBe(false)
		expect(
			compositionSchema.safeParse(contract("requirements", "tourism", ["a", "a"])).success
		).toBe(false)
	})
})

const now = new Date("2026-10-29T12:00:00Z")
const context = {
	holderType: "persona_natural" as const,
	holderCountry: "BO",
	taxCountry: "BO",
	payoutCountry: null,
	productCountry: "BO",
	vertical: "tour" as const,
	collectionModel: "property_collect" as const,
	experienceFormat: "guided_tour" as const,
	operatingRole: "guide" as const,
	jurisdictionCodes: ["geo:bo"],
	jurisdictionCode: "geo:bo",
	activityClasses: ["cultural"],
}
function version(
	id: string,
	role: CommercialPolicyVersion["jurisdictionRole"],
	composition?: PolicyComposition
): CommercialPolicyVersion {
	return {
		id,
		policySetId: id,
		jurisdictionRole: role,
		country: "BO",
		vertical: "tour",
		holderType: "persona_natural",
		collectionModel: "property_collect",
		status: "published",
		effectiveFrom: new Date("2026-01-01"),
		effectiveTo: null,
		approvedBy: "policy",
		approvedAt: now,
		approvalReference: "signed",
		signatures: (["policy", "finance", "tour_operations"] as const).map((approvalArea) => ({
			approvalArea,
			approverUserId: approvalArea,
			approvalReference: "signed",
			approvedAt: now,
		})),
		context: {
			contextVersion: composition ? 3 : 2,
			experienceFormats: ["guided_tour"],
			operatingRoles: ["guide"],
			activityClasses: ["cultural"],
			jurisdictionCodes: ["geo:bo"],
			...(composition ? { composition } : {}),
		},
		requirements:
			composition?.kind === "admission"
				? []
				: [
						{
							key: id,
							capabilities: ["publish"],
							acceptedEvidence: ["identity"],
							required: true,
							blockingAction: "Presenta el documento requerido.",
							reviewOwner: "compliance",
							sourceKind: "fastt_policy",
							sourceReference: "approved-policy",
							sourceCheckedAt: now,
							condition: { evidenceScope: "provider" },
						},
					],
	}
}
const base = () => [
	version("holder", "holder"),
	version("tax", "tax"),
	version("admission", "product", contract("admission")),
	version("license", "product", contract("requirements")),
]
describe("composition in the authorization evaluator", () => {
	it("never revives a predecessor after its replacement expires", () => {
		const versions = base()
		const successor = version(
			"expired-successor",
			"product",
			contract("requirements", "tourism", ["license"])
		)
		successor.effectiveTo = now
		versions.push(successor)
		const result = evaluateCommercialPolicy({
			context,
			versions,
			verifiedEvidence: ["identity"],
			now,
		})
		expect(result.capabilities.publish).toBe(false)
		expect(result.policyVersionIds).not.toContain("license")
		expect(result.compositionTrace?.[0].missingFamilies).toContain("tourism")
	})
	it("keeps a national obligation outside a territorial substitution", () => {
		const versions = base()
		const successor = version(
			"local-license",
			"product",
			contract("requirements", "tourism", ["license"])
		)
		successor.context!.jurisdictionCodes = ["geo:zz:local"]
		successor.requirements[0].acceptedEvidence = ["local-credential"]
		versions.push(successor)
		const regionalContext = {
			...context,
			jurisdictionCodes: ["geo:zz:local", "geo:zz:other"],
			jurisdictionCode: "geo:zz:local",
			territoryAncestors: { "geo:zz:local": ["geo:bo"], "geo:zz:other": ["geo:bo"] },
		}
		const result = evaluateCommercialPolicy({
			context: regionalContext,
			versions,
			verifiedEvidence: ["identity"],
			now,
		})
		expect(result.policyVersionIds).toEqual(expect.arrayContaining(["license", "local-license"]))
		expect(result.capabilities.publish).toBe(false)
		expect(
			result.compositionTrace?.find((trace) => trace.territoryId === "geo:zz:other")?.selectedIds
		).toContain("license")
		expect(
			evaluateCommercialPolicy({
				context: regionalContext,
				versions,
				verifiedEvidence: ["identity", "local-credential"],
				now,
			}).capabilities.publish
		).toBe(true)
	})
	it("does not invalidate a successor when its approved predecessor expires", () => {
		const versions = base()
		versions[3].effectiveTo = now
		versions.push(version("successor", "product", contract("requirements", "tourism", ["license"])))
		expect(
			evaluateCommercialPolicy({ context, versions, verifiedEvidence: ["identity"], now })
				.capabilities.publish
		).toBe(true)
	})
	it("allows only complete approved composition and emits trace", () => {
		const result = evaluateCommercialPolicy({
			context,
			versions: base(),
			verifiedEvidence: ["identity"],
			now,
		})
		expect(result.capabilities.publish).toBe(true)
		expect(result.compositionTrace?.[0].selectedIds).toEqual(["admission", "license"])
	})
	it("blocks missing or unapproved families without asking for arbitrary evidence", () => {
		for (const status of ["draft", "retired"] as const) {
			const versions = base()
			versions[3].status = status
			const result = evaluateCommercialPolicy({
				context,
				versions,
				verifiedEvidence: ["identity"],
				now,
			})
			expect(result.capabilities.publish).toBe(false)
			expect(result.compositionTrace?.[0].missingFamilies).toEqual(["tourism"])
		}
	})
	it("does not expand validity at the exclusive end boundary", () => {
		const versions = base()
		versions[3].effectiveTo = now
		expect(
			evaluateCommercialPolicy({ context, versions, verifiedEvidence: ["identity"], now })
				.capabilities.publish
		).toBe(false)
	})
	it("never silently combines historical and composable admission", () => {
		const versions = [...base(), version("historical", "product")]
		expect(
			evaluateCommercialPolicy({ context, versions, verifiedEvidence: ["identity"], now }).blockers
		).toContainEqual(expect.objectContaining({ id: "policy_context_conflict_product" }))
	})
	it("compares the same known context without weakening legacy evidence checks", () => {
		for (const verifiedEvidence of [[], ["identity"]]) {
			const legacy = evaluateCommercialPolicy({
				context,
				versions: [
					version("holder", "holder"),
					version("tax", "tax"),
					version("product", "product"),
				],
				verifiedEvidence,
				now,
			})
			const composed = evaluateCommercialPolicy({
				context,
				versions: base(),
				verifiedEvidence,
				now,
			})
			expect(composed.capabilities).toEqual(legacy.capabilities)
		}
	})
})
