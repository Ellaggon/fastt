import { describe, expect, it, vi } from "vitest"
import {
	publishProduct,
	type ProductAggregate,
	type ProductRepositoryPort,
} from "@/modules/catalog/public"
import { providerIdentitySchema } from "@/schemas/provider"

describe("phase 0 product scenarios (repository boundary controlled)", () => {
	for (const vertical of ["hotel", "tour"] as const) {
		for (const gate of ["ready", "canonical_blocker", "non_production"] as const) {
			it(`${vertical}: ${gate}`, async () => {
				const aggregate = {
					product: {
						id: "offer",
						providerId: "business",
						name: "Oferta",
						productType: vertical,
						geoPlaceId: "place",
					},
					imagesCount: 5,
					subtypeExists: true,
					content: { productId: "offer", highlightsJson: ["Destacado"], seoJson: null },
					location: { productId: "offer", address: "Lugar", lat: -16, lng: -68 },
					publication: { state: "draft", validationErrorsJson: null },
					verticalReadiness:
						vertical === "hotel"
							? {
									kind: "hotel",
									subtypeExists: true,
									hotel: { variantCount: 1, completeRoomCount: 1 },
								}
							: {
									kind: "tour",
									subtypeExists: true,
									tour: {
										imageCount: 5,
										itinerarySteps: 3,
										hasMeetingPoint: true,
										hasDurationMinutes: true,
										hasIncludes: true,
										hasCategory: true,
										hasActiveTickets: true,
										activeSlotCount: 1,
										completeSlotCount: 1,
									},
								},
				} as ProductAggregate
				const setProductPublication = vi.fn(async () => {})
				const repo = {
					getProductAggregate: async () => aggregate,
					setProductPublication,
					getProductPublicationEligibility: async () => ({
						eligible: gate !== "non_production",
						reason: gate === "non_production" ? "not_production" : null,
					}),
				} as unknown as ProductRepositoryPort
				const result = await publishProduct(
					{
						repo,
						resolvePublicationValidationErrors: async () =>
							gate === "canonical_blocker"
								? [{ code: "missing_availability", message: "Falta disponibilidad" }]
								: [],
					},
					{ productId: "offer" }
				)
				expect(result.productId).toBe("offer")
				expect(result.ok).toBe(gate === "ready")
				if (gate === "ready") {
					expect(setProductPublication).toHaveBeenLastCalledWith({
						productId: "offer",
						state: "published",
						validationErrorsJson: null,
					})
				} else {
					expect(result.validationErrors.map((error) => error.code)).toContain(
						gate === "canonical_blocker" ? "missing_availability" : "PUBLICATION_OWNER_INELIGIBLE"
					)
					expect(setProductPublication).not.toHaveBeenCalledWith(
						expect.objectContaining({ state: "published" })
					)
				}
			})
		}
	}
	it("increment 1 requires a real legal name as well as a display name", () => {
		expect(providerIdentitySchema.safeParse({ displayName: "Negocio" }).success).toBe(false)
		expect(
			providerIdentitySchema.safeParse({ displayName: "Negocio", legalName: " " }).success
		).toBe(false)
		expect(
			providerIdentitySchema.safeParse({ displayName: "Negocio", legalName: "Titular válido" })
				.success
		).toBe(true)
	})
})
