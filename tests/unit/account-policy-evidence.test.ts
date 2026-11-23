import { describe, expect, it } from "vitest"
import {
	accountEvidenceReadiness,
	collectAccountPolicyEvidence,
	type AccountPolicyEvidence,
} from "@/lib/commercial-policy/account-evidence"
import type { CommercialPolicyDiagnosis } from "@/lib/commercial-policy/evaluate"

const definitions = [
	{
		id: "existence",
		key: "bo.holder.entity_existence",
		family: "identity",
		label: "Existencia de la entidad titular",
		capture: {},
	},
	{
		id: "representation",
		key: "bo.holder.entity_representation",
		family: "identity",
		label: "Representación vigente de la entidad",
		capture: {},
	},
	{
		id: "tax",
		key: "bo.holder.tax_registration",
		family: "fiscal",
		label: "Identificación fiscal del titular",
		capture: {},
	},
]
const capabilities = {
	publish: false,
	booking: false,
	collect_payment: false,
	payout: false,
	integrations: false,
}
const diagnosis: CommercialPolicyDiagnosis = {
	capabilityStates: {
		publish: "blocked",
		booking: "blocked",
		collect_payment: "blocked",
		payout: "blocked",
		integrations: "blocked",
	},
	policyStatus: "supported",
	capabilities,
	satisfiedRequirements: [],
	policyVersionIds: ["policy"],
	applicableRequirements: definitions.map((d) => ({
		key: d.key,
		policyVersionId: "policy",
		required: true,
		capabilities: ["publish"],
		acceptedEvidence: [],
		blockingAction: "Revisar",
		reviewOwner: "compliance",
		condition: { evidenceScope: "provider", evidenceSubjectSelector: "holder" },
		documentAcceptance: {
			version: 1,
			alternatives: [{ id: "document", allOf: [{ definitionVersionId: d.id }] }],
		},
	})),
	blockers: definitions.map((d) => ({
		id: `requirement_${d.key}`,
		policyVersionId: "policy",
		capabilities: ["publish"],
		action: "Revisar",
		evidenceState: "missing",
	})),
}
const input = {
	diagnoses: [{ productId: "tour-a", diagnosis }],
	definitions,
	documents: [],
	providerId: "provider-a",
	holderType: "entidad",
}

describe("canonical account policy evidence presentation", () => {
	it("separates existence, representation and tax without creating extra navigation tabs", () => {
		expect(collectAccountPolicyEvidence(input).map((i) => [i.label, i.area, i.state])).toEqual([
			["Existencia de la entidad titular", "business", "missing"],
			["Representación vigente de la entidad", "business", "missing"],
			["Identificación fiscal del titular", "fiscal", "missing"],
		])
	})
	it("deduplicates a provider-wide requirement shared by several experiences", () => {
		expect(
			collectAccountPolicyEvidence({
				...input,
				diagnoses: [...input.diagnoses, { productId: "tour-b", diagnosis }],
			})
		).toHaveLength(3)
	})
	it("does not turn product-scoped evidence into account evidence", () => {
		const productOnly: CommercialPolicyDiagnosis = {
			...diagnosis,
			applicableRequirements: diagnosis.applicableRequirements!.map((r) => ({
				...r,
				condition: { ...r.condition, evidenceScope: "product" },
			})),
		}
		expect(
			collectAccountPolicyEvidence({
				...input,
				diagnoses: [{ productId: "tour-a", diagnosis: productOnly }],
			})
		).toEqual([])
	})
	it("fails visibly and disables upload if a required definition is unavailable", () => {
		const result = collectAccountPolicyEvidence({ ...input, definitions: [] })
		expect(result.every((i) => i.state === "unavailable" && !i.canUpload)).toBe(true)
	})
	it("uses the evaluator's state and never infers approval from the file type", () => {
		const rejected: CommercialPolicyDiagnosis = {
			...diagnosis,
			blockers: diagnosis.blockers.map((b) => ({ ...b, evidenceState: "rejected" })),
		}
		expect(
			collectAccountPolicyEvidence({
				...input,
				diagnoses: [{ productId: "tour-a", diagnosis: rejected }],
			}).every((i) => i.state === "rejected")
		).toBe(true)
	})
	it("keeps an approved fiscal record incomplete while its required backing is missing", () => {
		const items = collectAccountPolicyEvidence(input)
		expect(
			accountEvidenceReadiness(
				"ready",
				items.filter((i) => i.area === "fiscal")
			)
		).toBe("action_needed")
		expect(accountEvidenceReadiness("requires_changes", [])).toBe("requires_changes")
		expect(accountEvidenceReadiness("not_evaluable", [])).toBe("not_evaluable")
	})
	it("requires every company backing and preserves pending reviews", () => {
		const [existence, representation] = collectAccountPolicyEvidence(input)
		expect(
			accountEvidenceReadiness("ready", [{ ...existence, state: "verified" }, representation])
		).toBe("action_needed")
		expect(accountEvidenceReadiness("ready", [{ ...existence, state: "pending_review" }])).toBe(
			"in_review"
		)
		expect(
			accountEvidenceReadiness("ready", [
				{ ...existence, state: "verified" },
				{ ...representation, state: "verified" },
			])
		).toBe("ready")
	})
})
