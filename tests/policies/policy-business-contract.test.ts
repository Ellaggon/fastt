import { describe, expect, it } from "vitest"

import {
	getPolicyBusinessContract,
	normalizePolicyCoverage,
	policyBusinessKindFromProductType,
} from "@/lib/policies/policy-business-contract"
import { resolvePolicyPreset } from "@/data/policy/policy-presets"
import { POLICY_BUSINESS_CONTRACT_FIXTURES } from "../fixtures/policies/business-contract-fixtures"

describe("policy business contract", () => {
	it("keeps hotel policy semantics stable", () => {
		const fixture = POLICY_BUSINESS_CONTRACT_FIXTURES.hotel
		const contract = getPolicyBusinessContract(fixture.productType)
		expect(contract.allowedCategories).toEqual(fixture.categories)
		expect(contract.requiredCategories).toEqual(fixture.categories)
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
		expect(contract.requiredCategories).toEqual(fixture.categories)
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
			requiredCategories: fixture.categories,
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

	it("normalizes visible coverage to the categories required by each business", () => {
		expect(normalizePolicyCoverage("tour", 3)).toEqual({
			covered: 3,
			total: 3,
			label: "3/3",
		})
		expect(normalizePolicyCoverage("tour", 4)).toEqual({
			covered: 3,
			total: 3,
			label: "3/3",
		})
		expect(normalizePolicyCoverage("hotel", 3)).toEqual({
			covered: 3,
			total: 4,
			label: "3/4",
		})
		expect(normalizePolicyCoverage("unknown", 4)).toEqual({
			covered: 0,
			total: 0,
			label: "Sin contrato",
		})
	})
})
