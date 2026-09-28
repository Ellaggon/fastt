import { describe, expect, it } from "vitest"

import {
	diagnoseVerificationEvidence,
	type VerificationEvidenceOperation,
} from "@/lib/verification/evidence-diagnosis"

const requirement = {
	id: "tour.guide_credential",
	layer: "tour" as const,
	documentType: "operating_license" as const,
}
const operation: VerificationEvidenceOperation = {
	productId: "tour-la-paz",
	territoryCodes: ["BO-LP"],
	activityClasses: ["guided_nature"],
	at: new Date("2026-09-27T12:00:00Z"),
}

describe("tour verification evidence diagnosis", () => {
	it("requires a named guide subject and a concrete property scope", () => {
		const anonymousGuide = diagnoseVerificationEvidence({
			requirement,
			operation: { ...operation, resourceId: "guide-ana", subjectReferences: ["guide-ana"] },
			evidence: [{
				id: "anonymous-guide",
				type: "operating_license",
				status: "verified",
				expiresAt: null,
				subjectType: "person",
				subjectReference: null,
				scopes: [{ id: "tour", scopeType: "product", productId: "tour-la-paz", resourceId: null, territoryCode: null, territoryLabel: null, activityClass: null }],
			}],
		})
		expect(anonymousGuide).toMatchObject({ state: "action_needed", reason: "out_of_scope" })

		const ownership = diagnoseVerificationEvidence({
			requirement: { id: "lodging.ownership_proof", layer: "lodging", documentType: "ownership_proof" },
			operation: { productId: "hotel-1" },
			evidence: [{ id: "unscoped-deed", type: "ownership_proof", status: "verified", expiresAt: null, subjectType: "provider", subjectReference: null, scopes: [] }],
		})
		expect(ownership).toMatchObject({ state: "action_needed", reason: "out_of_scope" })
	})
	it("requires a current, in-scope licence for the selected experience", () => {
		const result = diagnoseVerificationEvidence({
			requirement,
			operation,
			evidence: [
				{
					id: "hotel-licence",
					type: "operating_license",
					status: "verified",
					expiresAt: null,
					subjectType: "provider",
					subjectReference: null,
					scopes: [
						{
							id: "scope-hotel",
							scopeType: "product",
							productId: "hotel-1",
							resourceId: null,
							territoryCode: null,
							territoryLabel: null,
							activityClass: null,
						},
					],
				},
			],
		})
		expect(result).toMatchObject({ state: "action_needed", reason: "out_of_scope" })
	})

	it("does not accept expired or holder-specific evidence for an unnamed operation", () => {
		const expired = diagnoseVerificationEvidence({
			requirement,
			operation,
			evidence: [
				{
					id: "expired-tour-licence",
					type: "operating_license",
					status: "verified",
					expiresAt: new Date("2026-09-01T00:00:00Z"),
					subjectType: "person",
					subjectReference: null,
					scopes: [
						{
							id: "scope-tour",
							scopeType: "product",
							productId: "tour-la-paz",
							resourceId: null,
							territoryCode: null,
							territoryLabel: null,
							activityClass: null,
						},
					],
				},
			],
		})
		expect(expired).toMatchObject({ state: "action_needed", reason: "expired" })

		const namedGuide = diagnoseVerificationEvidence({
			requirement,
			operation,
			evidence: [
				{
					id: "ana-licence",
					type: "operating_license",
					status: "verified",
					expiresAt: null,
					subjectType: "person",
					subjectReference: "guide-ana",
					scopes: [
						{
							id: "scope-tour",
							scopeType: "product",
							productId: "tour-la-paz",
							resourceId: null,
							territoryCode: null,
							territoryLabel: null,
							activityClass: null,
						},
					],
				},
			],
		})
		expect(namedGuide).toMatchObject({ state: "action_needed", reason: "out_of_scope" })
	})

	it("checks the named guide on a departure and rejects a hotel operator licence in the same territory", () => {
		const namedGuide = {
			id: "guide-ana",
			type: "operating_license" as const,
			status: "verified" as const,
			expiresAt: null,
			subjectType: "person" as const,
			subjectReference: "guide-ana",
			scopes: [
				{
					id: "territory",
					scopeType: "territory" as const,
					productId: null,
					resourceId: null,
					territoryCode: "BO-LP",
					territoryLabel: null,
					activityClass: null,
				},
			],
		}
		expect(
			diagnoseVerificationEvidence({
				requirement,
				evidence: [namedGuide],
				operation: { ...operation, resourceId: "guide-ana", subjectReferences: ["guide-ana"] },
			}).state
		).toBe("ready")
		expect(
			diagnoseVerificationEvidence({
				requirement,
				evidence: [namedGuide],
				operation: { ...operation, resourceId: "guide-luis", subjectReferences: ["guide-luis"] },
			}).state
		).toBe("action_needed")
		expect(
			diagnoseVerificationEvidence({
				requirement: {
					id: "tour.operator_license",
					layer: "tour",
					documentType: "operating_license",
				},
				evidence: [{ ...namedGuide, id: "hotel", subjectType: "provider", subjectReference: null }],
				operation,
			}).state
		).toBe("action_needed")
	})
})
