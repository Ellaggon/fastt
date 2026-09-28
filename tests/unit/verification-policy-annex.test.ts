import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { resolveVerificationRequirements } from "@/lib/verification/requirement-resolver"
import {
	annexIsSigned,
	lodgingPolicyAnnex,
	mayEnforceRequirement,
	policyAnnexForLine,
	policyAnnexForProductType,
	tourPolicyAnnex,
} from "@/lib/verification/policy-annex"

const base = {
	holderType: "persona_natural" as const,
	holderCountry: "BO",
	taxResidenceCountry: null,
	collectionModel: "property_collect" as const,
	tours: [
		{
			productId: "tour-1",
			operatingRole: "guide" as const,
			activityClasses: ["adventure"],
			jurisdictionCode: "LP",
			departureResourceIds: ["guide-1"],
		},
	],
}

describe("policy annexes", () => {
	it("gives lodging and tours different identifiers, packs and annexes", () => {
		expect(lodgingPolicyAnnex.annexId).not.toBe(tourPolicyAnnex.annexId)
		expect(lodgingPolicyAnnex.lineId).toBe("lodging")
		expect(tourPolicyAnnex.lineId).toBe("tour")
		expect(policyAnnexForProductType("hotel")?.annexId).toBe("annex.lodging.production")
		expect(policyAnnexForProductType("whole_home")?.annexId).toBe("annex.lodging.production")
		expect(policyAnnexForProductType("rental")?.annexId).toBe("annex.lodging.production")
		expect(policyAnnexForProductType("tour")?.annexId).toBe("annex.tour.bo.v1")
		expect(policyAnnexForProductType("package")).toBeNull()
		expect(policyAnnexForProductType("limousine")).toBeNull()
		expect(policyAnnexForLine("experiences")).toBeNull()
	})

	it("keeps new tour documents waiting for the three signatures", () => {
		expect(tourPolicyAnnex.status).toBe("awaiting_signature")
		expect(tourPolicyAnnex.requiredSigners).toEqual(["Políticas", "Finanzas", "Operaciones Tours"])
		expect(annexIsSigned(tourPolicyAnnex)).toBe(false)
		for (const id of tourPolicyAnnex.withheldRequirementIds) {
			expect(mayEnforceRequirement("tour", id)).toBe(false)
		}
		expect(mayEnforceRequirement("tour", "tour.guide_credential")).toBe(true)
		expect(mayEnforceRequirement("tour", "tour.unlisted_permit")).toBe(false)
		expect(mayEnforceRequirement("lodging", "tour.guide_credential")).toBe(false)
		expect(mayEnforceRequirement("lodging", "lodging.ownership_proof")).toBe(true)
		expect(mayEnforceRequirement("lodging", "lodging.unlisted_inspection")).toBe(false)
	})

	it("records the lodging rules already enforced and leaves tour documents out of that pack", () => {
		expect(lodgingPolicyAnnex.status).toBe("in_production")
		expect(lodgingPolicyAnnex.enforcedRequirementIds).toEqual([
			"shared.identity",
			"shared.operations",
			"shared.verification",
			"shared.fiscality",
			"shared.team",
			"shared.government_id",
			"shared.business_registration",
			"shared.payout_account",
			"lodging.ownership_proof",
			"lodging.establishment_license",
		])
		const lodgingIds = resolveVerificationRequirements({ ...base, lines: ["lodging"] }).requirements.map(
			(item) => item.id
		)
		expect(lodgingIds).not.toContain("tour.guide_credential")
		expect(lodgingIds).not.toContain("tour.insurance")
		expect(lodgingIds).toEqual(
			expect.arrayContaining(["lodging.ownership_proof", "lodging.establishment_license"])
		)
	})

	it("does not let the resolver emit a tour document that is still unsigned", () => {
		const tour = resolveVerificationRequirements({ ...base, lines: ["tour"] })
		const ids = tour.requirements.map((item) => item.id)
		for (const withheld of tourPolicyAnnex.withheldRequirementIds) {
			expect(ids).not.toContain(withheld)
		}
		expect(ids).not.toContain("lodging.ownership_proof")
	})

	it("points the lodging annex at production code and keeps the tour matrix unsigned", () => {
		const lodging = readFileSync("docs/domains/lodging/policy-annex.md", "utf8")
		const tour = readFileSync("docs/domains/tours/policy-annex.md", "utf8")
		expect(lodging).toContain("Status: active")
		expect(lodging).toContain("annex.lodging.production")
		expect(lodging).not.toContain("tour.protected_area_permit")
		expect(tour).toContain("Operaciones Tours")
		expect(tour).toContain("no una política publicada")
	})
})
