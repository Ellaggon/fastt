import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { buildVerificationScreenSections } from "@/lib/verification/screen-sections"
import {
	evaluateProductLineGate,
	type LineGateDepartureResource,
	type LineGateEvidence,
	type LineGateInput,
} from "@/lib/verification/line-gate"
import { tourPolicyAnnex } from "@/lib/verification/policy-annex"
import {
	accountGateDocumentTypes,
	resolveVerificationRequirements,
	type TourVerificationContext,
	type VerificationResolutionInput,
} from "@/lib/verification/requirement-resolver"

const today = new Date("2026-09-26T00:00:00.000Z")
const beforeExpiry = new Date("2026-09-30T00:00:00.000Z")
const expiryDay = new Date("2026-10-01T00:00:00.000Z")
const afterExpiry = new Date("2026-10-02T00:00:00.000Z")

function account(
	overrides: Partial<VerificationResolutionInput> & Pick<VerificationResolutionInput, "lines">
): VerificationResolutionInput {
	return {
		holderType: "persona_natural",
		holderCountry: "BO",
		taxResidenceCountry: "BO",
		collectionModel: "property_collect",
		tours: [],
		...overrides,
	}
}

function tour(
	overrides: Partial<TourVerificationContext> & Pick<TourVerificationContext, "productId">
): TourVerificationContext {
	return {
		operatingRole: "guide",
		activityClasses: ["urban_cultural"],
		jurisdictionCode: "BO-LP",
		departureResourceIds: [],
		...overrides,
	}
}

function gate(
	resolution: ReturnType<typeof resolveVerificationRequirements>,
	overrides: Partial<LineGateInput> & Pick<LineGateInput, "line" | "productId">
) {
	const input: LineGateInput = {
		capability: "publish",
		identityComplete: true,
		operationsComplete: true,
		verificationComplete: true,
		fiscalComplete: true,
		teamComplete: true,
		paymentsComplete: false,
		collectionModel: "property_collect",
		requirements: resolution.requirements,
		evidence: [],
		evaluatedAt: today,
		...overrides,
	}
	return evaluateProductLineGate(input)
}

function ids(decision: ReturnType<typeof evaluateProductLineGate>) {
	return decision.blockers.map((item) => item.id)
}

function verified(
	type: string,
	scopes: LineGateEvidence["scopes"] = [],
	expiresAt?: Date,
	subjectType: LineGateEvidence["subjectType"] = "provider",
	subjectReference?: string
): LineGateEvidence {
	return {
		type,
		status: "verified",
		scopes,
		expiresAt,
		subjectType,
		subjectReference: subjectReference ?? (subjectType === "person" ? "guide-ana" : null),
	}
}

function screen(
	resolution: ReturnType<typeof resolveVerificationRequirements>,
	lines: VerificationResolutionInput["lines"],
	collectionModel: VerificationResolutionInput["collectionModel"]
) {
	return buildVerificationScreenSections({
		lines,
		collectionModel,
		requirements: resolution.requirements,
		legalNameComplete: true,
		accountStatus: "approved",
		fiscalStatus: "verified",
		paymentsState: "not_started",
		documents: [],
	})
}

describe("line verification certification", () => {
	it("certifies an independent guide who collects directly", () => {
		const input = account({
			lines: ["tour"],
			collectionModel: "property_collect",
			tours: [tour({ productId: "walk-lp", departureResourceIds: ["guide-ana"] })],
		})
		const resolution = resolveVerificationRequirements(input)
		const requirementIds = resolution.requirements.map((item) => item.id)
		expect(requirementIds).toContain("tour.guide_credential")
		expect(requirementIds).not.toContain("shared.business_registration")
		expect(requirementIds).not.toContain("tour.insurance")
		expect(requirementIds).not.toContain("lodging.ownership_proof")
		expect(accountGateDocumentTypes(resolution)).toEqual(["government_id", "tax_document"])

		const visible = screen(resolution, input.lines, input.collectionModel)
		expect(visible.sections.map((section) => section.id)).toEqual(["shared", "tour"])
		expect(visible.paymentsCountsForSelling).toBe(false)
		expect(visible.sections[0].items.map((item) => item.id)).not.toContain("shared.payout_account")

		const evidence = [
			verified("government_id"),
			verified(
				"operating_license",
				[{ scopeType: "product", productId: "walk-lp" }],
				undefined,
				"person"
			),
		]
		const publish = gate(resolution, { line: "tour", productId: "walk-lp", evidence })
		expect(ids(publish)).toContain("tour.guide_credential")
		const booking = gate(resolution, {
			line: "tour",
			productId: "walk-lp",
			capability: "booking",
			evidence,
			jurisdictionCode: "BO-LP",
			activityClasses: ["urban_cultural"],
			departure: [{ resourceId: "guide-ana", role: "lead_guide" }],
		})
		expect(booking.allowed).toBe(true)
		expect(ids(booking)).not.toContain("shared.payout_account")
	})

	it("certifies a legal-entity operator with several activities", () => {
		const tours = [
			tour({
				productId: "rafting",
				operatingRole: "operator",
				activityClasses: ["adventure", "transport"],
				jurisdictionCode: "BO-LP",
			}),
			tour({
				productId: "city-food",
				operatingRole: "operator",
				activityClasses: ["urban_cultural", "gastronomic"],
				jurisdictionCode: "BO-SC",
			}),
		]
		const input = account({ lines: ["tour"], holderType: "entidad", tours })
		const resolution = resolveVerificationRequirements(input)
		const requirementIds = resolution.requirements.map((item) => item.id)
		expect(requirementIds.filter((id) => id === "tour.operator_license")).toEqual([
			"tour.operator_license",
		])
		expect(requirementIds.filter((id) => id === "shared.business_registration")).toEqual([
			"shared.business_registration",
		])
		expect(requirementIds).toContain("tour.insurance")
		expect(requirementIds).toContain("tour.food_handling_pending")
		expect(requirementIds).not.toContain("tour.guide_credential")
		for (const withheld of tourPolicyAnnex.withheldRequirementIds) {
			expect(requirementIds).not.toContain(withheld)
		}

		const visible = screen(resolution, input.lines, input.collectionModel)
		const food = visible.sections
			.find((section) => section.id === "tour")
			?.items.find((item) => item.id === "tour.food_handling_pending")
		expect(food?.countsTowardProgress).toBe(false)

		const sharedEvidence = [
			verified("government_id"),
			verified("business_registration"),
			verified(
				"operating_license",
				[
					{ scopeType: "product", productId: "rafting" },
					{ scopeType: "product", productId: "city-food" },
				],
				undefined,
				"legal_entity"
			),
		]
		const adventure = resolveVerificationRequirements(
			account({ lines: ["tour"], holderType: "entidad", tours: [tours[0]] })
		)
		expect(
			ids(gate(adventure, { line: "tour", productId: "rafting", evidence: sharedEvidence }))
		).toContain("tour.insurance")
		expect(
			gate(adventure, {
				line: "tour",
				productId: "rafting",
				evidence: [
					...sharedEvidence,
					verified("insurance", [{ scopeType: "product", productId: "rafting" }]),
				],
			}).allowed
		).toBe(true)

		const cultural = resolveVerificationRequirements(
			account({ lines: ["tour"], holderType: "entidad", tours: [tours[1]] })
		)
		const culturalDecision = gate(cultural, {
			line: "tour",
			productId: "city-food",
			evidence: sharedEvidence,
		})
		expect(culturalDecision.allowed).toBe(true)
		expect(ids(culturalDecision)).not.toContain("tour.insurance")
		expect(ids(culturalDecision)).not.toContain("tour.food_handling_pending")
	})

	it("certifies a hotel-only account", () => {
		const input = account({ lines: ["lodging"] })
		const resolution = resolveVerificationRequirements(input)
		const requirementIds = resolution.requirements.map((item) => item.id)
		expect(requirementIds).toEqual(
			expect.arrayContaining(["lodging.ownership_proof", "lodging.establishment_license"])
		)
		expect(requirementIds.some((id) => id.startsWith("tour."))).toBe(false)

		const visible = screen(resolution, input.lines, input.collectionModel)
		expect(visible.sections.map((section) => section.id)).toEqual(["shared", "lodging"])

		const missing = gate(resolution, {
			line: "lodging",
			productId: "hotel-1",
			evidence: [verified("government_id")],
		})
		expect(ids(missing)).toEqual(["lodging.ownership_proof", "lodging.establishment_license"])
		const ready = gate(resolution, {
			line: "lodging",
			productId: "hotel-1",
			capability: "booking",
			evidence: [
				verified("government_id"),
				verified("ownership_proof", [{ scopeType: "product", productId: "hotel-1" }]),
				verified("operating_license", [{ scopeType: "product", productId: "hotel-1" }]),
			],
		})
		expect(ready.allowed).toBe(true)
		expect(ids(ready).some((id) => id.startsWith("departure."))).toBe(false)
	})

	it("certifies a provider that has a hotel and tours", () => {
		const input = account({
			lines: ["lodging", "tour"],
			tours: [tour({ productId: "walk-lp" })],
		})
		const resolution = resolveVerificationRequirements(input)
		const visible = screen(resolution, input.lines, input.collectionModel)
		expect(visible.sections.map((section) => section.id)).toEqual(["shared", "lodging", "tour"])

		const identity = verified("government_id")
		const hotelLicense = verified("operating_license", [
			{ scopeType: "product", productId: "hotel-1" },
		])
		const tourLicense = verified(
			"operating_license",
			[{ scopeType: "product", productId: "walk-lp" }],
			undefined,
			"person"
		)
		const ownership = verified("ownership_proof", [{ scopeType: "product", productId: "hotel-1" }])

		const hotel = gate(resolution, {
			line: "lodging",
			productId: "hotel-1",
			evidence: [identity, ownership, hotelLicense],
		})
		expect(hotel.allowed).toBe(true)
		expect(ids(hotel).some((id) => id.startsWith("tour."))).toBe(false)

		const tourWithoutProperty = gate(resolution, {
			line: "tour",
			productId: "walk-lp",
			evidence: [identity, tourLicense],
			jurisdictionCode: "BO-LP",
		})
		expect(ids(tourWithoutProperty)).toContain("tour.guide_credential")
		expect(ids(tourWithoutProperty).some((id) => id.startsWith("lodging."))).toBe(false)
		expect(
			gate(resolution, {
				line: "tour",
				productId: "walk-lp",
				capability: "booking",
				evidence: [identity, tourLicense],
				jurisdictionCode: "BO-LP",
				departure: [{ resourceId: "guide-ana", role: "lead_guide" }],
			}).allowed
		).toBe(true)

		const hotelWithoutGuideCredential = gate(resolution, {
			line: "lodging",
			productId: "hotel-1",
			evidence: [identity, ownership, hotelLicense],
		})
		expect(hotelWithoutGuideCredential.allowed).toBe(true)
	})

	it("certifies a natural person without mercantile registration", () => {
		const resolution = resolveVerificationRequirements(
			account({ lines: ["lodging", "tour"], tours: [tour({ productId: "walk-lp" })] })
		)
		expect(resolution.requirements.map((item) => item.id)).not.toContain(
			"shared.business_registration"
		)
		expect(accountGateDocumentTypes(resolution)).not.toContain("business_registration")
		const visible = screen(resolution, ["lodging", "tour"], "property_collect")
		expect(
			visible.sections.flatMap((section) => section.items.map((item) => item.id))
		).not.toContain("shared.business_registration")
		const decision = gate(resolution, {
			line: "tour",
			productId: "walk-lp",
			evidence: [
				verified("government_id"),
				verified(
					"operating_license",
					[{ scopeType: "product", productId: "walk-lp" }],
					undefined,
					"person"
				),
			],
		})
		expect(ids(decision)).not.toContain("shared.business_registration")
		expect(ids(decision)).toContain("tour.guide_credential")
	})

	it("certifies an entity whose single registration is reused by both lines", () => {
		const input = account({
			lines: ["lodging", "tour"],
			holderType: "entidad",
			tours: [tour({ productId: "walk-lp" })],
		})
		const resolution = resolveVerificationRequirements(input)
		expect(
			resolution.requirements.filter((item) => item.id === "shared.business_registration")
		).toHaveLength(1)
		const visible = screen(resolution, input.lines, input.collectionModel)
		const registrationItems = visible.sections.flatMap((section) =>
			section.items.filter((item) => item.id === "shared.business_registration")
		)
		expect(registrationItems).toHaveLength(1)
		expect(visible.sections[0].id).toBe("shared")
		expect(visible.sections[0].items.map((item) => item.id)).toContain(
			"shared.business_registration"
		)

		const registration = verified("business_registration")
		const evidence = [
			verified("government_id"),
			registration,
			verified("ownership_proof", [{ scopeType: "product", productId: "hotel-1" }]),
			verified("operating_license", [{ scopeType: "product", productId: "hotel-1" }]),
			verified(
				"operating_license",
				[{ scopeType: "product", productId: "walk-lp" }],
				undefined,
				"person"
			),
		]
		expect(gate(resolution, { line: "lodging", productId: "hotel-1", evidence }).allowed).toBe(true)
		expect(
			gate(resolution, {
				line: "tour",
				productId: "walk-lp",
				capability: "booking",
				evidence,
				departure: [{ resourceId: "guide-ana", role: "lead_guide" }],
			}).allowed
		).toBe(true)
		const withoutRegistration = evidence.filter((item) => item.type !== "business_registration")
		expect(
			ids(
				gate(resolution, { line: "lodging", productId: "hotel-1", evidence: withoutRegistration })
			)
		).toContain("shared.business_registration")
		expect(
			ids(gate(resolution, { line: "tour", productId: "walk-lp", evidence: withoutRegistration }))
		).toContain("shared.business_registration")
	})

	it("keeps lodging progress intact and lets one explicitly scoped tour licence cover two tours", () => {
		const lodgingOnly = resolveVerificationRequirements(account({ lines: ["lodging"] }))
		const lodgingItemsBefore = screen(lodgingOnly, ["lodging"], "property_collect")
			.sections.find((section) => section.id === "lodging")
			?.items.map((item) => item.id)
		const mixedTours = [tour({ productId: "walk-lp" }), tour({ productId: "walk-sud" })]
		const mixed = resolveVerificationRequirements(
			account({ lines: ["lodging", "tour"], tours: mixedTours })
		)
		const lodgingItemsAfter = screen(mixed, ["lodging", "tour"], "property_collect")
			.sections.find((section) => section.id === "lodging")
			?.items.map((item) => item.id)
		expect(lodgingItemsAfter).toEqual(lodgingItemsBefore)

		const sharedTourLicence = verified(
			"operating_license",
			[
				{ scopeType: "product", productId: "walk-lp" },
				{ scopeType: "product", productId: "walk-sud" },
			],
			undefined,
			"person"
		)
		const evidence = [verified("government_id"), sharedTourLicence]
		for (const productId of ["walk-lp", "walk-sud"]) {
			expect(
				gate(mixed, {
					line: "tour",
					productId,
					capability: "booking",
					evidence,
					departure: [{ resourceId: "guide-ana", role: "lead_guide" }],
				}).allowed
			).toBe(true)
		}
		expect(
			gate(mixed, {
				line: "lodging",
				productId: "hotel-1",
				evidence: [
					verified("government_id"),
					verified("ownership_proof", [{ scopeType: "product", productId: "hotel-1" }]),
					sharedTourLicence,
				],
			}).allowed
		).toBe(false)
	})

	it("certifies an adventure tour that requires insurance", () => {
		const input = account({
			lines: ["tour"],
			tours: [
				tour({
					productId: "rafting",
					activityClasses: ["adventure"],
					departureResourceIds: ["guide-ana"],
				}),
			],
		})
		const resolution = resolveVerificationRequirements(input)
		expect(resolution.requirements.map((item) => item.id)).toContain("tour.insurance")
		expect(resolution.requirements.map((item) => item.id)).not.toContain(
			"tour.protected_area_permit"
		)

		const base = [
			verified("government_id"),
			verified(
				"operating_license",
				[{ scopeType: "product", productId: "rafting" }],
				undefined,
				"person"
			),
		]
		expect(ids(gate(resolution, { line: "tour", productId: "rafting", evidence: base }))).toContain(
			"tour.insurance"
		)
		const covered = [
			...base,
			verified("insurance", [
				{ scopeType: "product", productId: "rafting" },
				{ scopeType: "resource", resourceId: "guide-ana" },
			]),
		]
		expect(
			ids(
				gate(resolution, {
					line: "tour",
					productId: "rafting",
					activityClasses: ["adventure"],
					evidence: covered,
				})
			)
		).toContain("tour.guide_credential")
		const departure: LineGateDepartureResource[] = [{ resourceId: "guide-ana", role: "lead_guide" }]
		expect(
			gate(resolution, {
				line: "tour",
				productId: "rafting",
				capability: "booking",
				activityClasses: ["adventure"],
				evidence: covered,
				departure,
			}).allowed
		).toBe(true)
		const otherGuide = gate(resolution, {
			line: "tour",
			productId: "rafting",
			capability: "booking",
			activityClasses: ["adventure"],
			evidence: covered,
			departure: [{ resourceId: "guide-luis", role: "lead_guide" }],
		})
		expect(ids(otherGuide)).toContain("departure.insurance")
	})

	it("certifies a guide change and an expiry on a future departure", () => {
		const input = account({
			lines: ["lodging", "tour"],
			tours: [tour({ productId: "walk-lp", departureResourceIds: ["guide-ana"] })],
		})
		const resolution = resolveVerificationRequirements(input)
		const credential = verified(
			"operating_license",
			[
				{ scopeType: "resource", resourceId: "guide-ana" },
				{ scopeType: "territory", territoryCode: "BO-LP" },
			],
			expiryDay,
			"person"
		)
		const evidence = [verified("government_id"), credential]
		const departureFor = (resourceId: string): LineGateDepartureResource[] => [
			{ resourceId, role: "lead_guide" },
		]
		const booking = (resourceId: string, evaluatedAt: Date) =>
			gate(resolution, {
				line: "tour",
				productId: "walk-lp",
				capability: "booking",
				evidence,
				jurisdictionCode: "BO-LP",
				activityClasses: ["urban_cultural"],
				departure: departureFor(resourceId),
				evaluatedAt,
			})

		expect(
			ids(
				gate(resolution, {
					line: "tour",
					productId: "walk-lp",
					evidence,
					jurisdictionCode: "BO-LP",
				})
			)
		).toContain("tour.guide_credential")
		expect(booking("guide-ana", beforeExpiry).allowed).toBe(true)
		expect(booking("guide-ana", expiryDay).allowed).toBe(true)
		expect(ids(booking("guide-luis", beforeExpiry))).toContain("departure.guide")
		expect(booking("guide-ana", afterExpiry).allowed).toBe(false)

		const hotel = gate(resolution, {
			line: "lodging",
			productId: "hotel-1",
			evidence: [
				verified("government_id"),
				verified("ownership_proof", [{ scopeType: "product", productId: "hotel-1" }]),
				verified("operating_license", [{ scopeType: "product", productId: "hotel-1" }]),
			],
			evaluatedAt: afterExpiry,
		})
		expect(hotel.allowed).toBe(true)
		expect(ids(hotel).some((id) => id.startsWith("tour.") || id.startsWith("departure."))).toBe(
			false
		)
	})

	it("keeps the booking door on the departure date", () => {
		const booking = readFileSync("src/pages/api/booking/confirm.ts", "utf8")
		expect(booking).toContain("lineGateEvaluationDate(holdMeta.departureDate)")
		expect(booking).toContain("evaluatedAt:")
	})
})
