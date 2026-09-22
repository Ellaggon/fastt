import { describe, expect, it } from "vitest"

import {
	getPolicyBusinessContract,
	policyBusinessKindFromProductType,
} from "@/lib/policies/policy-business-contract"
import { resolvePolicyPreset } from "@/data/policy/policy-presets"
import { POLICY_BUSINESS_CONTRACT_FIXTURES } from "../fixtures/policies/business-contract-fixtures"

describe("policy business contract", () => {
	it("keeps hotel policy semantics stable before tour compatibility is introduced", () => {
		const fixture = POLICY_BUSINESS_CONTRACT_FIXTURES.hotel
		const contract = getPolicyBusinessContract(fixture.productType)
		expect(contract.allowedCategories).toEqual(fixture.categories)
		expect(contract.cancellation).toMatchObject({
			anchor: fixture.cancellation.anchor,
			allowedLeadUnits: fixture.cancellation.units,
			allowedPenaltyBases: fixture.cancellation.bases,
		})
		expect(contract.noShow.allowedPenaltyBases).toEqual(fixture.noShowBases)
		expect(contract.payment).toMatchObject({
			allowedTypes: fixture.paymentTypes,
			platformCollectsFunds: fixture.platformCollectsFunds,
		})
		expect(resolvePolicyPreset("long_term", "Cancellation")?.rules).toMatchObject({
			minStayNights: 28,
		})
	})

	it("defines tour contracts against a scheduled departure and provider collection", () => {
		const fixture = POLICY_BUSINESS_CONTRACT_FIXTURES.tour
		const contract = getPolicyBusinessContract(fixture.productType)
		expect(contract.allowedCategories).toEqual(fixture.categories)
		expect(contract.cancellation).toMatchObject({
			anchor: fixture.cancellation.anchor,
			allowedLeadUnits: fixture.cancellation.units,
			allowedPenaltyBases: fixture.cancellation.bases,
		})
		expect(contract.noShow.allowedPenaltyBases).toEqual(fixture.noShowBases)
		expect(contract.payment).toMatchObject({
			allowedTypes: fixture.paymentTypes,
			platformCollectsFunds: fixture.platformCollectsFunds,
		})
	})

	it("fails closed for a business without an approved policy contract", () => {
		const fixture = POLICY_BUSINESS_CONTRACT_FIXTURES.unknown
		expect(policyBusinessKindFromProductType(fixture.productType)).toBe("unknown")
		expect(getPolicyBusinessContract(fixture.productType)).toMatchObject({
			allowedCategories: fixture.categories,
			cancellation: {
				anchor: fixture.cancellation.anchor,
				allowedLeadUnits: fixture.cancellation.units,
				allowedPenaltyBases: fixture.cancellation.bases,
			},
			noShow: { allowedPenaltyBases: fixture.noShowBases },
			payment: {
				allowedTypes: fixture.paymentTypes,
				platformCollectsFunds: fixture.platformCollectsFunds,
			},
		})
	})
})
