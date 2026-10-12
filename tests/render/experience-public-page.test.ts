import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ format: null as string | null }))
vi.mock("@/container", () => ({ searchOffers: async () => [] }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/lib/tours/loadTourCommercialContext", () => ({
	loadTourCommercialContext: async () => ({
		status: "resolved",
		productId: "experience",
		variantId: "option",
		ratePlanId: "rate",
	}),
	tourContextEntryResponse: () => null,
}))
vi.mock("@/shared/infrastructure/db/compat", async (original) => {
	const actual = await original<typeof import("@/shared/infrastructure/db/compat")>()
	return {
		...actual,
		db: {
			select: (fields?: Record<string, unknown>) => {
				let table: unknown
				const rows = () =>
					table === actual.Product
						? fields
							? [{ providerId: "provider", productType: "tour" }]
							: [
									{
										Product: {
											id: "experience",
											name: "Práctica de cocina",
											productType: "tour",
											publicationState: "published",
										},
										Provider: { displayName: "Negocio" },
										ProductContent: {
											description:
												"Una experiencia para aprender recetas locales y practicar técnicas con productos de la región.",
										},
									},
								]
						: table === actual.Tour
							? [
									{
										experienceFormat: state.format,
										durationMinutes: 60,
										itineraryJson: [{ description: "Práctica con ingredientes" }],
										guideJson: { guideType: "local", languages: "es" },
										difficultyLevel: "easy",
										pickupJson: { defaultArea: "Recogida antigua" },
										meetingPointJson: { address: "Sala de cocina" },
									},
								]
							: table === actual.ProductCategoryLink
								? [{ name: "Gastronomía", slug: "gastronomia" }]
								: []
				const query: any = {
					from: (value: unknown) => {
						table = value
						return query
					},
					innerJoin: () => query,
					leftJoin: () => query,
					where: () => query,
					orderBy: () => query,
					limit: () => query,
					then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject),
				}
				return query
			},
		},
	}
})
import Page from "@/pages/tours/[id]/index.astro"

it.each(["guided_tour", "workshop", "class", "tasting", null])(
	"public and provider preview render the same experience content for %s",
	async (format) => {
		state.format = format
		const container = await AstroContainer.create()
		for (const preview of [false, true]) {
			const request = new Request(
				`http://localhost/tours/experience?variantId=option&ratePlanId=rate${preview ? "&preview=provider" : ""}`
			)
			const html = await container.renderToString(Page, { request, params: { id: "experience" } })
			expect(html).toContain("Práctica con ingredientes")
			expect(html).toContain("Gastronomía")
			expect(html).toContain("Elige fecha y horario")
			if (format === "guided_tour") {
				expect(html).toContain("Itinerario")
				expect(html).toContain("Modalidad de guía")
			} else if (format != null) {
				expect(html).toContain("Programa")
				expect(html).not.toContain("Modalidad de guía")
				expect(html).not.toContain("Recogida antigua")
			}
			expect(html.includes('"@type":"TouristTrip"')).toBe(format === "guided_tour" && !preview)
			if (preview) expect(html).toContain("data-preview-booking-disabled")
		}
	}
)
