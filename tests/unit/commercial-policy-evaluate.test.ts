import { describe, expect, it } from "vitest"
import {
	evaluateCommercialPolicy,
	tourPolicyPublicationErrors,
	type CommercialPolicyContext,
	type CommercialPolicyVersion,
} from "@/lib/commercial-policy/evaluate"

const context: CommercialPolicyContext = {
	holderType: "persona_natural",
	holderCountry: "CL",
	taxCountry: "CL",
	payoutCountry: "CL",
	productCountry: "BO",
	vertical: "tour",
	collectionModel: "property_collect",
	operatingRole: "guide",
	jurisdictionCode: "BO-LP",
	activityClasses: ["guided_nature"],
}
function version(
	role: CommercialPolicyVersion["jurisdictionRole"],
	country: string,
	vertical: CommercialPolicyVersion["vertical"] = "tour"
): CommercialPolicyVersion {
	return {
		id: vertical === "tour" ? `${role}-1` : `${vertical}-${role}-1`,
		jurisdictionRole: role,
		country,
		vertical,
		holderType: "persona_natural",
		collectionModel: "property_collect",
		status: "published",
		effectiveFrom: new Date("2026-01-01"),
		effectiveTo: null,
		approvedBy: "reviewer",
		approvedAt: new Date("2026-01-01"),
		approvalReference: "signed-annex",
		context:
			vertical === "tour"
				? {
						operatingRoles: ["guide"],
						activityClasses: ["guided_nature"],
						jurisdictionCodes: ["BO-LP"],
					}
				: null,
		signatures:
			vertical === "tour"
				? ["policy", "finance", "tour_operations"].map((approvalArea) => ({
						approvalArea: approvalArea as "policy" | "finance" | "tour_operations",
						approverUserId: `${approvalArea}-reviewer`,
						approvalReference: `signed-${approvalArea}`,
						approvedAt: new Date("2026-01-01"),
					}))
				: [],
		requirements: [
			{
				key: `${role}-identity`,
				capabilities: ["publish", "booking"],
				acceptedEvidence: [`${role}-verified`],
				required: true,
				blockingAction: `Aporta evidencia de ${role}.`,
				reviewOwner: "policies",
				sourceKind: "fastt_policy",
				sourceReference: "FASTT-TOUR-BO-1",
				sourceCheckedAt: new Date("2026-01-01"),
				condition: { evidenceScope: "provider" },
			},
		],
	}
}
describe("commercial policy diagnosis", () => {
	it("blocks every capability when the jurisdiction has no approved annex", () => {
		const result = evaluateCommercialPolicy({ context, versions: [], verifiedEvidence: [] })
		expect(result.policyStatus).toBe("unsupported")
		expect(Object.values(result.capabilities)).toEqual([false, false, false, false, false])
	})
	it("requires the full signed tour tuple before a version can authorize a capability", () => {
		const candidate = version("product", "BO")
		candidate.signatures = candidate.signatures.filter(
			(signature) => signature.approvalArea !== "finance"
		)
		expect(tourPolicyPublicationErrors(candidate)).toContain("tour_policy_signatures_incomplete")
		candidate.signatures.push({
			approvalArea: "finance",
			approverUserId: "finance-reviewer",
			approvalReference: "FIN-TOUR-BO-1",
			approvedAt: new Date("2026-01-01"),
		})
		candidate.context = {
			operatingRoles: ["guide"],
			activityClasses: [],
			jurisdictionCodes: ["BO-LP"],
		}
		expect(tourPolicyPublicationErrors(candidate)).toContain("tour_policy_context_incomplete")
		candidate.context.activityClasses = ["guided_nature"]
		candidate.requirements[0].sourceReference = null
		expect(tourPolicyPublicationErrors(candidate)).toContain(
			"requirement_product-identity_source_missing"
		)
	})
	it("does not require payout jurisdiction or a Fastt payout capability when the provider collects", () => {
		const versions = [
			version("holder", "CL"),
			version("product", "BO"),
			version("tax", "CL"),
			version("payout", "CL"),
		]
		const result = evaluateCommercialPolicy({
			context,
			versions,
			verifiedEvidence: ["holder-verified", "product-verified", "tax-verified", "payout-verified"],
		})
		expect(result.policyStatus).toBe("supported")
		expect(result.capabilities.publish).toBe(true)
		expect(result.policyVersionIds).toHaveLength(3)
		expect(result.capabilityStates.payout).toBe("not_applicable")
		expect(result.capabilityStates.collect_payment).toBe("not_applicable")
		expect(result.satisfiedRequirements).toEqual(
			expect.arrayContaining([expect.objectContaining({ evidenceScope: "provider" })])
		)
	})
	it("blocks only the capabilities affected by unverified evidence", () => {
		const versions = [
			version("holder", "CL"),
			version("product", "BO"),
			version("tax", "CL"),
			version("payout", "CL"),
		]
		const result = evaluateCommercialPolicy({
			context,
			versions,
			verifiedEvidence: ["holder-verified", "tax-verified", "payout-verified"],
		})
		expect(result.capabilities.publish).toBe(false)
		expect(result.capabilities.booking).toBe(false)
		expect(result.capabilityStates.collect_payment).toBe("not_applicable")
		expect(result.blockers).toMatchObject([
			{ id: "requirement_product-identity", policyVersionId: "product-1" },
		])
	})
	it("rejects overlapping published versions and unsigned approvals", () => {
		const versions = [
			version("holder", "CL"),
			version("product", "BO"),
			version("tax", "CL"),
			version("payout", "CL"),
		]
		versions.push({ ...versions[1], id: "product-2" })
		const result = evaluateCommercialPolicy({ context, versions, verifiedEvidence: [] })
		expect(result.blockers.some((row) => row.id === "policy_context_conflict_product")).toBe(true)
		versions.pop()
		versions[1].approvalReference = null
		expect(
			evaluateCommercialPolicy({ context, versions, verifiedEvidence: [] }).blockers.some(
				(row) => row.id === "policy_context_unsupported_product"
			)
		).toBe(true)
	})
	it("does not grant capabilities from a signed but empty policy", () => {
		const versions = [
			version("holder", "CL"),
			version("product", "BO"),
			version("tax", "CL"),
			version("payout", "CL"),
		]
		versions[0].requirements = []
		const result = evaluateCommercialPolicy({
			context,
			versions,
			verifiedEvidence: ["product-verified", "tax-verified", "payout-verified"],
		})
		expect(result.capabilities.publish).toBe(false)
		expect(result.blockers.some((row) => row.id === "policy_contract_empty_holder")).toBe(true)
	})
	it("requires payout only for platform collection", () => {
		const platformContext = { ...context, collectionModel: "platform_collect" as const }
		const versions = ["holder", "product", "tax", "payout"]
			.map((role) =>
				version(
					role as CommercialPolicyVersion["jurisdictionRole"],
					role === "product" ? "BO" : "CL"
				)
			)
			.map((item) => ({ ...item, collectionModel: "platform_collect" as const }))
		const payout = versions.find((item) => item.jurisdictionRole === "payout")!
		payout.requirements = [
			{
				...payout.requirements[0],
				capabilities: ["payout"],
			},
		]
		const result = evaluateCommercialPolicy({
			context: platformContext,
			versions,
			verifiedEvidence: ["holder-verified", "product-verified", "tax-verified"],
		})
		expect(result.capabilities.publish).toBe(true)
		expect(result.capabilities.payout).toBe(false)
		expect(result.blockers.some((item) => item.id === "requirement_payout-identity")).toBe(true)
	})

	it("requires verified, current evidence in the tour's real scope", () => {
		const versions = [version("holder", "CL"), version("product", "BO"), version("tax", "CL")]
		versions[1].requirements = [
			{
				key: "tour-license",
				capabilities: ["publish", "booking"],
				acceptedEvidence: ["operating_license"],
				required: true,
				blockingAction: "Carga la licencia que cubra esta experiencia.",
				reviewOwner: "tours",
				sourceKind: "legal",
				sourceReference: "BO-TUR-ART-1",
				sourceCheckedAt: new Date("2026-01-01"),
			},
		]
		const result = evaluateCommercialPolicy({
			context: {
				...context,
				productId: "tour-la-paz",
				jurisdictionCode: "BO-LP",
				activityClasses: ["guided_nature"],
			},
			versions,
			evidence: [
				{
					id: "license-uyuni",
					type: "operating_license",
					status: "verified",
					expiresAt: new Date("2026-12-31T00:00:00Z"),
					scopes: [{ scopeType: "territory", territoryCode: "BO-PO" }],
				},
			],
			now: new Date("2026-09-26T00:00:00Z"),
		})
		expect(result.capabilities.publish).toBe(false)
		expect(result.blockers).toContainEqual(
			expect.objectContaining({
				id: "requirement_tour-license",
				evidenceState: "out_of_scope",
			})
		)
	})

	it("does not treat a hotel licence or its pending review as a tour guide credential", () => {
		const versions = [version("holder", "CL"), version("product", "BO"), version("tax", "CL")]
		versions[1].requirements = [
			{
				key: "guide-credential",
				capabilities: ["publish", "booking"],
				acceptedEvidence: ["operating_license"],
				required: true,
				blockingAction: "Aporta la credencial del guía.",
				reviewOwner: "tours",
				sourceKind: "legal",
				sourceReference: "BO-TUR-ART-2",
				sourceCheckedAt: new Date("2026-01-01"),
			},
		]
		const tourContext = {
			...context,
			productId: "tour-la-paz",
			operatingRole: "guide" as const,
			jurisdictionCode: "BO-LP",
			subjectReferences: ["guide-ana"],
		}
		const hotelLicense = {
			id: "hotel-license",
			type: "operating_license",
			status: "verified" as const,
			subjectType: "provider" as const,
			scopes: [{ scopeType: "product" as const, productId: "hotel-la-paz" }],
		}
		const accountEvidence = [
			{ id: "holder", type: "holder-verified", status: "verified" as const, scopes: [] },
			{ id: "tax", type: "tax-verified", status: "verified" as const, scopes: [] },
		]
		const diagnosis = evaluateCommercialPolicy({
			context: tourContext,
			versions,
			evidence: [
				...accountEvidence,
				hotelLicense,
				{ ...hotelLicense, id: "hotel-pending", status: "pending" },
			],
		})
		expect(diagnosis.capabilities.publish).toBe(false)
		expect(diagnosis.blockers).toContainEqual(
			expect.objectContaining({
				id: "requirement_guide-credential",
				evidenceState: "out_of_scope",
			})
		)
		const guideLicense = {
			...hotelLicense,
			id: "guide-license",
			subjectType: "person" as const,
			subjectReference: "guide-ana",
			scopes: [{ scopeType: "product" as const, productId: "tour-la-paz" }],
		}
		expect(
			evaluateCommercialPolicy({
				context: tourContext,
				versions,
				evidence: [...accountEvidence, hotelLicense, guideLicense],
			}).capabilities.publish
		).toBe(true)
	})

	it("does not grant a product requirement from an unscoped historical document", () => {
		const versions = [version("holder", "CL"), version("product", "BO"), version("tax", "CL")]
		versions[1].requirements = [
			{
				key: "tour-insurance",
				capabilities: ["publish", "booking"],
				acceptedEvidence: ["insurance"],
				required: true,
				blockingAction: "Carga un seguro con alcance declarado.",
				reviewOwner: "risk",
				sourceKind: "fastt_policy",
				sourceReference: "FASTT-RISK-1",
				sourceCheckedAt: new Date("2026-01-01"),
			},
		]
		const result = evaluateCommercialPolicy({
			context: { ...context, productId: "tour-la-paz", jurisdictionCode: "BO-LP" },
			versions,
			evidence: [{ id: "historic-insurance", type: "insurance", status: "verified", scopes: [] }],
		})
		expect(result.blockers).toContainEqual(
			expect.objectContaining({
				id: "requirement_tour-insurance",
				evidenceState: "out_of_scope",
			})
		)
	})

	it("certifies hotel and tour products independently for a mixed provider", () => {
		const sharedEvidence = ["holder-verified", "product-verified", "tax-verified"]
		const hotelContext = { ...context, vertical: "hotel" as const, productId: "hotel-1" }
		const tourContext = { ...context, vertical: "tour" as const, productId: "tour-1" }
		const hotelVersions = [
			version("holder", "CL", "hotel"),
			version("product", "BO", "hotel"),
			version("tax", "CL", "hotel"),
		]
		const tourVersions = [version("holder", "CL"), version("product", "BO"), version("tax", "CL")]

		expect(
			evaluateCommercialPolicy({
				context: hotelContext,
				versions: hotelVersions,
				verifiedEvidence: sharedEvidence,
			}).capabilities.publish
		).toBe(true)
		expect(
			evaluateCommercialPolicy({
				context: tourContext,
				versions: tourVersions,
				verifiedEvidence: sharedEvidence,
			}).capabilities.publish
		).toBe(true)
		expect(
			evaluateCommercialPolicy({
				context: tourContext,
				versions: hotelVersions,
				verifiedEvidence: sharedEvidence,
			}).capabilities.publish
		).toBe(false)
	})
})

describe("experience format policy boundaries", () => {
	const versions = () => [version("holder", "CL"), version("product", "BO"), version("tax", "CL")]
	const verifiedEvidence = ["holder-verified", "product-verified", "tax-verified"]
	it("preserves legacy tour approvals but never extends them to a workshop", () => {
		expect(
			evaluateCommercialPolicy({ context, versions: versions(), verifiedEvidence }).capabilities
				.publish
		).toBe(true)
		for (const experienceFormat of ["workshop", "class", "tasting"] as const) {
			const diagnosis = evaluateCommercialPolicy({
				context: { ...context, experienceFormat, formatContractVersion: 1 },
				versions: versions(),
				verifiedEvidence,
			})
			expect(diagnosis.policyStatus).toBe("unsupported")
			expect(diagnosis.capabilities.publish).toBe(false)
			expect(diagnosis.capabilities.booking).toBe(false)
		}
	})
	it("requires explicit classification for a new contract", () => {
		expect(
			evaluateCommercialPolicy({
				context: { ...context, formatContractVersion: 1, experienceFormat: null },
				versions: versions(),
				verifiedEvidence,
			}).capabilities.publish
		).toBe(false)
	})
	it("matches only the formats explicitly covered by a signed v2 policy", () => {
		const policies = versions().map((policy) => ({
			...policy,
			context: { ...policy.context!, contextVersion: 2, experienceFormats: ["workshop" as const] },
		}))
		expect(
			evaluateCommercialPolicy({
				context: { ...context, experienceFormat: "workshop", formatContractVersion: 1 },
				versions: policies,
				verifiedEvidence,
			}).capabilities.publish
		).toBe(true)
		expect(
			evaluateCommercialPolicy({
				context: { ...context, experienceFormat: "class", formatContractVersion: 1 },
				versions: policies,
				verifiedEvidence,
			}).capabilities.publish
		).toBe(false)
	})
	it("rejects unknown policy versions and format declarations without v2", () => {
		for (const selector of [
			{ contextVersion: 99 },
			{ experienceFormats: ["workshop" as const] },
			{ contextVersion: 2, experienceFormats: [] },
		]) {
			const policy = version("product", "BO")
			policy.context = { ...policy.context!, ...selector }
			expect(tourPolicyPublicationErrors(policy).length).toBeGreaterThan(0)
		}
	})
})
