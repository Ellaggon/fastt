import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { resolveVerificationRequirements } from "@/lib/verification/requirement-resolver"
import {
	evaluateProductLineGate,
	productLineGateEnforcementEnabled,
	type LineGateInput,
} from "@/lib/verification/line-gate"
import { governanceCheckIdsFor } from "@/lib/verification/governance-capabilities"

const root = new URL("../../", import.meta.url)

function readyShared(overrides: Partial<LineGateInput> = {}): LineGateInput {
	return {
		capability: "publish",
		line: "lodging",
		productId: "hotel-1",
		identityComplete: true,
		operationsComplete: true,
		verificationComplete: true,
		fiscalComplete: true,
		teamComplete: true,
		paymentsComplete: false,
		collectionModel: "property_collect",
		requirements: [],
		evidence: [],
		...overrides,
	}
}

function lodgingRequirements() {
	return resolveVerificationRequirements({
		lines: ["lodging", "tour"],
		holderType: "persona_natural",
		holderCountry: "BO",
		taxResidenceCountry: "BO",
		collectionModel: "property_collect",
		tours: [
			{
				productId: "tour-1",
				operatingRole: "guide",
				activityClasses: ["adventure"],
				jurisdictionCode: "BO-LP",
				departureResourceIds: [],
			},
		],
	}).requirements
}

describe("product line gate", () => {
	it("stays off until commercial-policy rollout is enabled for the provider", () => {
		expect(
			productLineGateEnforcementEnabled({
				providerId: "prov-1",
				env: { FASTT_ENFORCE_COMMERCIAL_POLICY: "false" },
			})
		).toBe(false)
		expect(
			productLineGateEnforcementEnabled({
				providerId: "prov-1",
				env: {
					FASTT_ENFORCE_COMMERCIAL_POLICY: "true",
					FASTT_COMMERCIAL_POLICY_ROLLOUT_STAGE: "general",
				},
			})
		).toBe(true)
	})

	it("blocks a hotel on the shared checks and the lodging pack, not on a guide", () => {
		const decision = evaluateProductLineGate(
			readyShared({
				requirements: lodgingRequirements(),
				evidence: [{ type: "government_id", status: "verified" }],
			})
		)
		expect(decision.allowed).toBe(false)
		expect(decision.blockers.map((item) => item.id)).toEqual([
			"lodging.ownership_proof",
			"lodging.establishment_license",
		])
		expect(decision.blockers.some((item) => item.id.includes("guide"))).toBe(false)
	})

	it("blocks a tour on the guide credential and does not ask for the property", () => {
		const decision = evaluateProductLineGate(
			readyShared({
				line: "tour",
				productId: "tour-1",
				capability: "publish",
				requirements: lodgingRequirements(),
				evidence: [{ type: "government_id", status: "verified" }],
			})
		)
		expect(decision.blockers.map((item) => item.id)).toEqual(
			expect.arrayContaining(["tour.guide_credential", "tour.insurance"])
		)
		expect(decision.blockers.some((item) => item.layer === "lodging")).toBe(false)
	})

	it("does not let a verified hotel licence authorize a tour", () => {
		const decision = evaluateProductLineGate(
			readyShared({
				line: "tour",
				productId: "tour-1",
				requirements: lodgingRequirements(),
				evidence: [
					{ type: "government_id", status: "verified" },
					{
						type: "operating_license",
						status: "verified",
						scopes: [{ scopeType: "product", productId: "hotel-1" }],
					},
					{
						type: "insurance",
						status: "verified",
						scopes: [{ scopeType: "product", productId: "hotel-1" }],
					},
				],
			})
		)
		expect(decision.blockers.map((item) => item.id)).toEqual(
			expect.arrayContaining(["tour.guide_credential", "tour.insurance"])
		)
	})

	it("does not let an unscoped licence close the hotel and the tour", () => {
		const evidence = [
			{ type: "government_id", status: "verified" },
			{ type: "ownership_proof", status: "verified", scopes: [{ scopeType: "product", productId: "hotel-1" }] },
			{ type: "operating_license", status: "verified" },
			{ type: "insurance", status: "verified" },
		]
		const hotel = evaluateProductLineGate(
			readyShared({
				requirements: lodgingRequirements(),
				evidence,
			})
		)
		const tour = evaluateProductLineGate(
			readyShared({
				line: "tour",
				productId: "tour-1",
				requirements: lodgingRequirements(),
				evidence,
			})
		)
		expect(hotel.blockers.map((item) => item.id)).toContain("lodging.establishment_license")
		expect(tour.blockers.map((item) => item.id)).toEqual(
			expect.arrayContaining(["tour.guide_credential", "tour.insurance"])
		)
	})

	it("keeps the five account checks and leaves payments out of direct collection", () => {
		const decision = evaluateProductLineGate(
			readyShared({
				identityComplete: false,
				paymentsComplete: false,
				collectionModel: "property_collect",
				requirements: lodgingRequirements(),
				evidence: [
					{ type: "government_id", status: "verified" },
					{ type: "ownership_proof", status: "verified", scopes: [{ scopeType: "product", productId: "hotel-1" }] },
					{
						type: "operating_license",
						status: "verified",
						scopes: [{ scopeType: "product", productId: "hotel-1" }],
					},
				],
			})
		)
		expect(decision.blockers.map((item) => item.id)).toEqual(["shared.identity"])
		const fastt = evaluateProductLineGate(
			readyShared({
				collectionModel: "platform_collect",
				paymentsComplete: false,
				requirements: resolveVerificationRequirements({
					lines: ["lodging"],
					holderType: "entidad",
					holderCountry: "BO",
					taxResidenceCountry: "BO",
					collectionModel: "platform_collect",
					tours: [],
				}).requirements,
				evidence: [
					{ type: "government_id", status: "verified" },
					{ type: "business_registration", status: "verified" },
					{ type: "ownership_proof", status: "verified", scopes: [{ scopeType: "product", productId: "hotel-1" }] },
					{
						type: "operating_license",
						status: "verified",
						scopes: [{ scopeType: "product", productId: "hotel-1" }],
					},
				],
			})
		)
		expect(fastt.blockers.map((item) => item.id)).toContain("shared.payout_account")
	})

	it("checks the guide and insurance of a departure without inventing a vehicle requirement", () => {
		const requirements = resolveVerificationRequirements({
			lines: ["tour"],
			holderType: "persona_natural",
			holderCountry: "BO",
			taxResidenceCountry: null,
			collectionModel: "property_collect",
			tours: [
				{
					productId: "tour-1",
					operatingRole: "guide",
					activityClasses: ["transport"],
					jurisdictionCode: "BO-LP",
					departureResourceIds: [],
				},
			],
		}).requirements
		const published = evaluateProductLineGate(
			readyShared({
				line: "tour",
				productId: "tour-1",
				capability: "publish",
				requirements,
				evidence: [
					{ type: "government_id", status: "verified" },
					{ type: "operating_license", status: "verified", subjectType: "person", subjectReference: "guide-ana", scopes: [{ scopeType: "product", productId: "tour-1" }] },
					{ type: "insurance", status: "verified", scopes: [{ scopeType: "product", productId: "tour-1" }] },
				],
			})
		)
		// A named credential is only proven against a named departure guide; the
		// product cannot claim that relationship before a departure is selected.
		expect(published.blockers.map((item) => item.id)).toContain("tour.guide_credential")
		const booking = evaluateProductLineGate(
			readyShared({
				line: "tour",
				productId: "tour-1",
				capability: "booking",
				requirements,
				evidence: [
					{ type: "government_id", status: "verified" },
					{ type: "operating_license", status: "verified", subjectType: "person", subjectReference: "guide-ana", scopes: [{ scopeType: "product", productId: "tour-1" }] },
					{ type: "insurance", status: "verified", scopes: [{ scopeType: "product", productId: "tour-1" }] },
				],
				activityClasses: ["transport"],
				jurisdictionCode: "BO-LP",
				departure: [],
			})
		)
		expect(booking.blockers.map((item) => item.id)).toEqual(expect.arrayContaining(["departure.guide"]))
		expect(booking.blockers.map((item) => item.id)).not.toContain("departure.vehicle")
		const covered = evaluateProductLineGate(
			readyShared({
				line: "tour",
				productId: "tour-1",
				capability: "booking",
				requirements,
				activityClasses: ["transport"],
				jurisdictionCode: "BO-LP",
				evidence: [
					{ type: "government_id", status: "verified" },
					{ type: "operating_license", status: "verified", subjectType: "person", subjectReference: "guide-ana", scopes: [{ scopeType: "product", productId: "tour-1" }] },
					{ type: "insurance", status: "verified", scopes: [{ scopeType: "product", productId: "tour-1" }] },
				],
				departure: [
					{ resourceId: "guide-ana", role: "lead_guide" },
					{ resourceId: "van-1", role: "vehicle" },
				],
			})
		)
		expect(covered.allowed).toBe(true)
	})

	it("does not let an insurance policy for another vehicle cover this departure", () => {
		const requirements = resolveVerificationRequirements({
			lines: ["tour"],
			holderType: "persona_natural",
			holderCountry: "BO",
			taxResidenceCountry: null,
			collectionModel: "property_collect",
			tours: [
				{
					productId: "tour-1",
					operatingRole: "guide",
					activityClasses: ["adventure"],
					jurisdictionCode: "BO-LP",
					departureResourceIds: ["van-1"],
				},
			],
		}).requirements
		const decision = evaluateProductLineGate(
			readyShared({
				line: "tour",
				productId: "tour-1",
				capability: "booking",
				requirements,
				activityClasses: ["adventure"],
				evidence: [
					{ type: "government_id", status: "verified" },
					{
						type: "operating_license",
						status: "verified",
						subjectType: "person",
						scopes: [{ scopeType: "product", productId: "tour-1" }],
					},
					{
						type: "insurance",
						status: "verified",
						scopes: [{ scopeType: "resource", resourceId: "other-van" }],
					},
				],
				departure: [
					{ resourceId: "guide-ana", role: "lead_guide" },
					{ resourceId: "van-1", role: "vehicle" },
				],
			})
		)
		expect(decision.blockers.map((item) => item.id)).toContain("departure.insurance")
	})

	it("blocks a departure when its guide changes to a subject without the checked credential", () => {
		const requirements = resolveVerificationRequirements({
			lines: ["tour"], holderType: "persona_natural", holderCountry: "BO", taxResidenceCountry: null,
			collectionModel: "property_collect",
			tours: [{ productId: "tour-1", operatingRole: "guide", activityClasses: ["urban_cultural"], jurisdictionCode: "BO-LP", departureResourceIds: [] }],
		}).requirements
		const decision = evaluateProductLineGate(readyShared({
			line: "tour", productId: "tour-1", capability: "booking", requirements,
			evidence: [{ type: "government_id", status: "verified" }, {
				type: "operating_license", status: "verified", subjectType: "person", subjectReference: "guide-ana",
				scopes: [{ scopeType: "product", productId: "tour-1" }],
			}],
			departure: [{ resourceId: "guide-luis", role: "lead_guide" }],
		}))
		expect(decision.blockers.map((item) => item.id)).toContain("departure.guide")
	})

	it("sends publish, booking and preview through the same gate", () => {
		expect(governanceCheckIdsFor("publish")).toEqual([
			"identity",
			"operations",
			"verification",
			"fiscality",
			"team",
		])
		const publish = readFileSync(new URL("src/pages/api/product/publish.ts", root), "utf8")
		const booking = readFileSync(new URL("src/pages/api/booking/confirm.ts", root), "utf8")
		const preview = readFileSync(new URL("src/pages/product/[id]/preview.astro", root), "utf8")
		expect(publish).toContain("assertProductLineGate")
		expect(publish).toContain("forceForTour: true")
		expect(booking).toContain("assertProductLineGate")
		expect(booking).toContain("departureResourcesForBooking")
		expect(preview).toContain("loadProductLineGate")
		expect(publish).not.toContain("commercial-lines")
		expect(publish).not.toContain("requirement-resolver")
	})
})
