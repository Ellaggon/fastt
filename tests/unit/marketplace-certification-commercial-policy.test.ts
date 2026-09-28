import { describe, expect, it } from "vitest"

import {
	hasRequiredTourApprovals,
	tourPolicyPublicationErrors,
	type CommercialPolicyVersion,
} from "@/lib/commercial-policy/evaluate"

function tourCertVersion(signatures: CommercialPolicyVersion["signatures"]): CommercialPolicyVersion {
	return {
		id: "cpv_marketplace_cert_tour_product_v1",
		jurisdictionRole: "product",
		country: "BO",
		vertical: "tour",
		holderType: "entidad",
		collectionModel: "property_collect",
		status: "published",
		effectiveFrom: new Date("2026-01-01T00:00:00Z"),
		effectiveTo: null,
		approvedBy: "user_marketplace_certification",
		approvedAt: new Date("2026-01-01T00:00:00Z"),
		approvalReference: "marketplace-certification-fixture",
		context: {
			operatingRoles: ["guide"],
			activityClasses: ["urban_cultural"],
			jurisdictionCodes: ["BO-LP"],
		},
		signatures,
		requirements: [
			{
				key: "certification_ready",
				capabilities: ["booking"],
				acceptedEvidence: ["government_id"],
				required: true,
				blockingAction: "Fixture de certificación.",
				reviewOwner: "policies",
				sourceKind: "fastt_policy",
				sourceReference: "MARKETPLACE-CERT-1",
				sourceCheckedAt: new Date("2026-01-01T00:00:00Z"),
				condition: { evidenceScope: "provider" },
			},
		],
	}
}

describe("marketplace certification commercial policy fixture", () => {
	it("requires three distinct approvers per tour version", () => {
		const singleSigner = tourCertVersion([
			{
				approvalArea: "policy",
				approverUserId: "user_marketplace_certification",
				approvalReference: "cert-policy",
				approvedAt: new Date("2026-01-01T00:00:00Z"),
			},
		])
		expect(hasRequiredTourApprovals(singleSigner)).toBe(false)
		expect(tourPolicyPublicationErrors(singleSigner)).toContain("tour_policy_signatures_incomplete")

		const tripleSigner = tourCertVersion(
			(["policy", "finance", "tour_operations"] as const).map((approvalArea, index) => ({
				approvalArea,
				approverUserId: `user_marketplace_cert_approver_${index}`,
				approvalReference: `cert-${approvalArea}`,
				approvedAt: new Date("2026-01-01T00:00:00Z"),
			}))
		)
		expect(hasRequiredTourApprovals(tripleSigner)).toBe(true)
		expect(tourPolicyPublicationErrors(tripleSigner)).toEqual([])
	})
})
