import { expect, it } from "vitest"
import { projectAdminPolicyBlockers } from "@/lib/commercial-policy/admin-publication-blockers"
import type { ProviderContractOffering } from "@/lib/commercial-policy/provider-contract-surface"

function offering(productId: string, codes: string[]): ProviderContractOffering {
	return {
		productId,
		name: productId,
		commercialLine: "tour",
		reasons: codes.map((code) => ({ code })),
	} as ProviderContractOffering
}

it("groups shared policy gaps without duplicating products", () => {
	const result = projectAdminPolicyBlockers([
		offering("one", ["policy_context_unsupported_holder", "policy_context_unsupported_holder"]),
		offering("two", ["policy_context_unsupported_holder", "policy_context_conflict_product"]),
	])
	expect(result).toHaveLength(2)
	expect(result[0].label).toBe("Titular del negocio")
	expect(result[0].products.map((product) => product.id)).toEqual(["one", "two"])
	expect(result[1].label).toBe("Experiencia")
})

it("does not confuse agreements, evidence or other verticals with policy configuration", () => {
	expect(
		projectAdminPolicyBlockers([
			offering("one", ["agreement_acceptance_required", "document_missing"]),
			{ ...offering("hotel", ["policy_context_unsupported_tax"]), commercialLine: "lodging" },
		])
	).toEqual([])
})
