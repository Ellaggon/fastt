import { describe, expect, it } from "vitest"
import { evaluateCommercialPolicy, type CommercialPolicyContext, type CommercialPolicyVersion } from "@/lib/commercial-policy/evaluate"

const context: CommercialPolicyContext = {
	holderType: "persona_natural",
	holderCountry: "CL",
	taxCountry: "CL",
	payoutCountry: "CL",
	productCountry: "BO",
	vertical: "tour",
	collectionModel: "property_collect",
}
function version(role: CommercialPolicyVersion["jurisdictionRole"], country: string): CommercialPolicyVersion {
	return {
		id: `${role}-1`, jurisdictionRole: role, country, vertical: "tour", holderType: "persona_natural",
		collectionModel: "property_collect", status: "published", effectiveFrom: new Date("2026-01-01"),
		effectiveTo: null, approvedBy: "reviewer", approvedAt: new Date("2026-01-01"), approvalReference: "signed-annex",
		requirements: [{ key: `${role}-identity`, capabilities: ["publish", "booking"], acceptedEvidence: [`${role}-verified`], required: true, blockingAction: `Aporta evidencia de ${role}.`, reviewOwner: "policies" }],
	}
}
describe("commercial policy diagnosis", () => {
	it("blocks every capability when the jurisdiction has no approved annex", () => {
		const result = evaluateCommercialPolicy({ context, versions: [], verifiedEvidence: [] })
		expect(result.policyStatus).toBe("unsupported")
		expect(Object.values(result.capabilities)).toEqual([false, false, false, false, false])
	})
	it("composes holder, product, tax and payout without confusing their countries", () => {
		const versions = [version("holder", "CL"), version("product", "BO"), version("tax", "CL"), version("payout", "CL")]
		const result = evaluateCommercialPolicy({ context, versions, verifiedEvidence: ["holder-verified", "product-verified", "tax-verified", "payout-verified"] })
		expect(result.policyStatus).toBe("supported")
		expect(result.capabilities.publish).toBe(true)
		expect(result.policyVersionIds).toHaveLength(4)
	})
	it("blocks only the capabilities affected by unverified evidence", () => {
		const versions = [version("holder", "CL"), version("product", "BO"), version("tax", "CL"), version("payout", "CL")]
		const result = evaluateCommercialPolicy({ context, versions, verifiedEvidence: ["holder-verified", "tax-verified", "payout-verified"] })
		expect(result.capabilities.publish).toBe(false)
		expect(result.capabilities.booking).toBe(false)
		expect(result.capabilities.collect_payment).toBe(true)
		expect(result.blockers).toMatchObject([{ id: "requirement_product-identity", policyVersionId: "product-1" }])
	})
	it("rejects overlapping published versions and unsigned approvals", () => {
		const versions = [version("holder", "CL"), version("product", "BO"), version("tax", "CL"), version("payout", "CL")]
		versions.push({ ...versions[1], id: "product-2" })
		const result = evaluateCommercialPolicy({ context, versions, verifiedEvidence: [] })
		expect(result.blockers.some((row) => row.id === "policy_context_conflict_product")).toBe(true)
		versions.pop()
		versions[1].approvalReference = null
		expect(evaluateCommercialPolicy({ context, versions, verifiedEvidence: [] }).blockers.some((row) => row.id === "policy_context_unsupported_product")).toBe(true)
	})
	it("does not grant capabilities from a signed but empty policy", () => {
		const versions = [version("holder", "CL"), version("product", "BO"), version("tax", "CL"), version("payout", "CL")]
		versions[0].requirements = []
		const result = evaluateCommercialPolicy({ context, versions, verifiedEvidence: ["product-verified", "tax-verified", "payout-verified"] })
		expect(result.capabilities.publish).toBe(false)
		expect(result.blockers.some((row) => row.id === "policy_contract_empty_holder")).toBe(true)
	})
})
