import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	getProductVerticalEntry,
	listActiveProductVerticalEntries,
	normalizeProductTypeValue,
	normalizeProductVertical,
	productVerticalRegistry,
	resolveProductVerticalEntry,
} from "@/lib/catalog/productVerticalRegistry"
import { getVerticalVocabulary, resolveVerticalVocabulary } from "@/lib/verticalVocabulary"

describe("catalog/product vertical registry", () => {
	it("maps canonical product types to provider-facing verticals", () => {
		expect(normalizeProductVertical("Hotel")).toBe("hotel")
		expect(normalizeProductVertical("Alojamientos")).toBe("hotel")
		expect(normalizeProductVertical("Tour")).toBe("tour")
		expect(normalizeProductVertical("Package")).toBe("package")
		expect(normalizeProductVertical("paquetes")).toBe("package")

		expect(getProductVerticalEntry("Hotel").labels.workspaceSingular).toBe("Alojamiento")
		expect(getProductVerticalEntry("Tour").labels.workspaceSingular).toBe("Tour")
		expect(getProductVerticalEntry("Package").labels.workspaceSingular).toBe("Paquete")
	})

	it("normalizes productType values to canonical DB casing", () => {
		expect(normalizeProductTypeValue("hotel")).toBe("Hotel")
		expect(normalizeProductTypeValue("TOUR")).toBe("Tour")
		expect(normalizeProductTypeValue("paquete")).toBe("Package")
		expect(normalizeProductTypeValue("unknown")).toBeNull()
	})

	it("keeps only Hotel, Tour and Package as active product verticals for now", () => {
		const active = listActiveProductVerticalEntries()

		expect(active.map((entry) => entry.productType)).toEqual(["Hotel", "Tour", "Package"])
		expect(active.map((entry) => entry.creation.typeOptionLabel)).toEqual([
			"Alojamiento",
			"Tour",
			"Paquete",
		])
		expect(productVerticalRegistry.rental.status).toBe("planned")
		expect(productVerticalRegistry.generic.status).toBe("fallback")
	})

	it("defines public routes and creation copy by vertical", () => {
		expect(productVerticalRegistry.hotel.routes.publicDetailHref("p1")).toBe("/hotels/p1")
		expect(productVerticalRegistry.tour.routes.publicDetailHref("p1")).toBe("/tours/p1")
		expect(productVerticalRegistry.package.routes.publicDetailHref("p1")).toBe("/packages/p1")
		expect(productVerticalRegistry.hotel.routes.workspaceFilteredHref).toBe("/product?type=Hotel")
		expect(productVerticalRegistry.tour.routes.workspaceFilteredHref).toBe("/product?type=Tour")
		expect(productVerticalRegistry.package.routes.workspaceFilteredHref).toBe(
			"/product?type=Package"
		)

		expect(productVerticalRegistry.hotel.creation.heading).toBe("Crear alojamiento")
		expect(productVerticalRegistry.tour.creation.namePlaceholder).toContain("City Tour")
		expect(productVerticalRegistry.package.creation.namePlaceholder).toContain("4 dias")
	})

	it("defines readiness sections by vertical without making all products look like hotels", () => {
		expect(productVerticalRegistry.hotel.readiness.requiredSections).toContain("rooms")
		expect(productVerticalRegistry.hotel.readiness.requiredSections).toContain("houseRules")

		expect(productVerticalRegistry.tour.readiness.requiredSections).toContain("itinerary")
		expect(productVerticalRegistry.tour.readiness.requiredSections).not.toContain("rooms")
		expect(productVerticalRegistry.tour.readiness.requiredSections).not.toContain("houseRules")

		expect(productVerticalRegistry.package.readiness.requiredSections).toContain("inclusions")
		expect(productVerticalRegistry.package.readiness.requiredSections).not.toContain("rooms")
	})

	it("keeps catalog context copy out of restrictions/sellability semantics", () => {
		const contextLines = Object.values(productVerticalRegistry).map((entry) => entry.contextLine)
		const joined = contextLines.join("\n")

		expect(joined).toContain("Prepara la ficha del alojamiento")
		expect(joined).toContain("Prepara la ficha del tour")
		expect(joined).toContain("Prepara la ficha del paquete")
		expect(joined).not.toMatch(/Stop Sell|CTA|CTD|Booking Window|cuando se puede vender/i)
	})

	it("does not keep legacy product form components after the catalog/create flow moved to pages", () => {
		const legacyFormFiles = [
			"src/components/productForm/create/ProductBaseForm.astro",
			"src/components/productForm/create/HotelForm.astro",
			"src/components/productForm/create/TourForm.astro",
			"src/components/productForm/create/PackageForm.astro",
			"src/components/productForm/update/HotelForm.astro",
			"src/components/productForm/update/TourForm.astro",
			"src/components/productForm/update/PackageForm.astro",
		]

		for (const file of legacyFormFiles) {
			expect(existsSync(file)).toBe(false)
		}
	})

	it("keeps existing verticalVocabulary consumers compatible", () => {
		expect(getVerticalVocabulary("hotel").productPlural).toBe("alojamientos")
		expect(getVerticalVocabulary("tour").variantPlural).toBe("salidas")
		expect(getVerticalVocabulary("package").scopeVariant).toBe("Modalidad")

		expect(resolveVerticalVocabulary(["Hotel"]).product).toBe("alojamiento")
		expect(resolveVerticalVocabulary(["Hotel", "Tour"]).product).toBe("oferta")
		expect(resolveVerticalVocabulary(["Hotel", "Tour"]).scopeProduct).toBe("Oferta")
		expect(resolveVerticalVocabulary(["Hotel", "Tour"]).scopeRatePlan).toBe("Tarifa")
		expect(resolveProductVerticalEntry(["Package"]).vertical).toBe("package")
	})
})
