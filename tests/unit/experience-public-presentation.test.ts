import { describe, expect, it } from "vitest"
import {
	experiencePublicPresentation,
	experienceStructuredData,
} from "@/lib/tours/experienceFormatPresentation"
import { applicableExperienceVerificationRequirements } from "@/lib/provider-tour-verification"
import { resolveVerificationRequirements } from "@/lib/verification/requirement-resolver"
import type { CommercialPolicyDiagnosis } from "@/lib/commercial-policy/evaluate"

describe("experience presentation and approved evidence", () => {
	it.each(["class", "workshop", "tasting"])(
		"uses neutral operation copy for %s without reinterpreting guide data",
		(format) => {
			expect(experiencePublicPresentation(format)).toMatchObject({
				programLabel: "Programa",
				showTourDetails: false,
				locationLabel: "Lugar e indicaciones",
			})
			expect(
				experienceStructuredData({
					format,
					name: "Experiencia",
					url: "https://fastt.test/tours/id",
					preview: false,
				})
			).toBeUndefined()
		}
	)
	it("does not infer a historical format or publish private structured data", () => {
		expect(experiencePublicPresentation(null).formatLabel).toBeNull()
		expect(
			experienceStructuredData({
				format: null,
				name: "Tour antiguo",
				url: "https://fastt.test/tours/id",
				preview: false,
			})
		).toBeUndefined()
		expect(
			experienceStructuredData({
				format: "guided_tour",
				name: "Ruta",
				url: "https://fastt.test/tours/id",
				preview: true,
			})
		).toBeUndefined()
		expect(
			experienceStructuredData({
				format: "guided_tour",
				name: "Ruta",
				url: "https://fastt.test/tours/id",
				preview: false,
			})
		).toMatchObject({ "@type": "TouristTrip", "name": "Ruta" })
	})
	const requirements = resolveVerificationRequirements({
		lines: ["tour"],
		holderType: "entidad",
		holderCountry: "BO",
		taxResidenceCountry: "BO",
		collectionModel: "property_collect",
		tours: [
			{
				productId: "experience",
				operatingRole: "operator",
				activityClasses: ["adventure", "gastronomic"],
				jurisdictionCode: "BO-LP",
				departureResourceIds: [],
			},
		],
	}).requirements
	it("does not ask for tourist evidence without an applicable approved policy", () => {
		const visible = applicableExperienceVerificationRequirements(requirements, null, "class")
		expect(visible.filter((item) => item.layer === "tour" && item.documentType)).toEqual([])
		expect(visible.some((item) => item.id === "tour.food_handling_pending")).toBe(false)
		expect(visible.filter((item) => item.layer !== "tour")).toEqual(
			requirements.filter((item) => item.layer !== "tour")
		)
	})
	it("offers only existing evidence fields accepted by the applicable policy", () => {
		const diagnosis = {
			policyStatus: "supported",
			applicableRequirements: [{ acceptedEvidence: ["insurance"] }],
		} as CommercialPolicyDiagnosis
		const visible = applicableExperienceVerificationRequirements(
			requirements,
			diagnosis,
			"workshop"
		)
		expect(
			visible.filter((item) => item.layer === "tour" && item.documentType).map((item) => item.id)
		).toEqual(["tour.insurance"])
		const unsupported = { ...diagnosis, policyStatus: "unsupported" } as CommercialPolicyDiagnosis
		expect(
			applicableExperienceVerificationRequirements(requirements, unsupported, "workshop").some(
				(item) => item.layer === "tour" && item.documentType
			)
		).toBe(false)
	})
})
