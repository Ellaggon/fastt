import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { hotelSchema, tourSchema } from "@/schemas/product/subtype"

function read(relativePath: string) {
	return readFileSync(resolve(relativePath), "utf8")
}

function validTour() {
	return {
		productId: "tour_123",
		productType: "tour" as const,
		duration: "4 horas",
		durationMinutes: 240,
		meetingPointJson: { address: "Puerta principal" },
		itineraryJson: [
			{ step: 1, description: "Bienvenida" },
			{ step: 2, description: "Recorrido" },
			{ step: 3, description: "Mirador" },
		],
		includesJson: ["Guía local"],
	}
}

describe("Tour content-form wizard", () => {
	it("requires the structured Tour launch essentials", () => {
		expect(tourSchema.safeParse(validTour()).success).toBe(true)
		expect(
			tourSchema.safeParse({
				...validTour(),
				itineraryJson: validTour().itineraryJson.slice(0, 2),
			}).success
		).toBe(false)
		expect(
			tourSchema.safeParse({
				...validTour(),
				meetingPointJson: { address: "" },
			}).success
		).toBe(false)
		expect(tourSchema.safeParse({ ...validTour(), includesJson: [] }).success).toBe(false)
	})

	it("keeps Hotel fields outside Tour-only validation and copy", () => {
		expect(
			hotelSchema.safeParse({
				productId: "hotel_123",
				productType: "hotel",
				stars: "4",
				phone: "",
				email: "",
				website: "",
			}).success
		).toBe(true)
		const subtype = read("src/pages/product/[id]/subtype.astro")
		expect(subtype).toContain('data-is-tour={pt === "tour" ? "true" : "false"}')
		expect(subtype).toContain('pt === "hotel"')
		expect(subtype).toContain('name="stars"')
	})

	it("distinguishes discovery location from the meeting point", () => {
		const location = read("src/pages/product/[id]/location.astro")
		const subtype = read("src/pages/product/[id]/subtype.astro")
		expect(location).toContain("Ubicación para discovery")
		expect(location).toContain("El punto exacto donde empieza el tour")
		expect(subtype).toContain("no es la ubicación de discovery")
	})

	it("allows keyboard image selection and continuing with existing photos", () => {
		const page = read("src/pages/product/[id]/images.astro")
		const handler = read("src/lib/forms/productImagesHandler.ts")
		expect(page).toContain('id="imageCount"')
		expect(page).toContain('role="button"')
		expect(handler).toContain('event.key !== "Enter" && event.key !== " "')
		expect(handler).toContain("Continuando con las fotos existentes.")
		expect(handler).toContain('playbook === "launch-tour"')
	})
})
