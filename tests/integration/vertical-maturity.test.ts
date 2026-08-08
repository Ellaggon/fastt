import { describe, expect, it } from "vitest"
import {
	db,
	Image,
	Limousine,
	Package,
	ProductCategory,
	ProductCategoryLink,
	ProductContent,
	ProductLocation,
	RatePlan,
	Tour,
	TourSlotProfile,
	TourTicketType,
	Variant,
	VariantCapacity,
	eq,
} from "@/shared/infrastructure/db/compat"
import { TOUR_QUALITY_MIN_IMAGES } from "@/lib/tours/tourAdminQuality"

import { PRODUCT_VERTICALS, normalizeProductTypeForStorage } from "@/lib/productVerticalRegistry"
import { productRepository } from "@/container"
import { evaluateProductReadiness } from "@/modules/catalog/public"
import { SubtypeRepository } from "@/modules/catalog/infrastructure/repositories/SubtypeRepository"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

async function seedReadyCatalogBase(params: {
	productId: string
	productType: string
	destinationId: string
}) {
	await upsertDestination({
		id: params.destinationId,
		name: `Destination ${params.destinationId}`,
		type: "city",
		country: "BO",
		slug: params.destinationId,
	})
	await upsertProduct({
		id: params.productId,
		name: `Oferta ${params.productType}`,
		productType: params.productType,
		destinationId: params.destinationId,
	})
	await db.insert(ProductContent).values({
		productId: params.productId,
		description: "Contenido listo",
		highlightsJson: ["Destacado"],
	})
	await db.insert(ProductLocation).values({
		productId: params.productId,
		address: "Direccion",
		lat: -16.5,
		lng: -68.13,
	})
	await db.insert(Image).values({
		id: `img_${params.productId}`,
		entityType: "product",
		entityId: params.productId,
		objectKey: `products/${params.productId}.jpg`,
		url: "https://example.com/image.jpg",
		isPrimary: true,
		order: 0,
	})
}

describe("vertical maturity", () => {
	it("stores Package itinerary/includes/excludes as structured JSON", async () => {
		const suffix = crypto.randomUUID()
		const productId = `pkg_${suffix}`
		await upsertDestination({
			id: `dest_${suffix}`,
			name: "La Paz",
			type: "city",
			country: "BO",
			slug: `la-paz-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Paquete Andes",
			productType: "Package",
			destinationId: `dest_${suffix}`,
		})

		const repo = new SubtypeRepository()
		await repo.insertPackageStandalone({
			productId,
			days: 3,
			nights: 2,
			itineraryJson: [{ day: 1, description: "Llegada y city tour" }],
			includesJson: ["Traslados", "Guia"],
			excludesJson: ["Propinas"],
		})

		const row = await db
			.select()
			.from(Package)
			.where(eq(Package.productId, productId))
			.then((rows) => rows[0])
		expect(row?.itineraryJson).toEqual([{ day: 1, description: "Llegada y city tour" }])
		expect(row?.includesJson).toEqual(["Traslados", "Guia"])
		expect(row?.excludesJson).toEqual(["Propinas"])
	})

	it("stores Tour meeting point, itinerary, safety and guide as structured JSON", async () => {
		const suffix = crypto.randomUUID()
		const productId = `tour_${suffix}`
		await upsertDestination({
			id: `dest_${suffix}`,
			name: "Uyuni",
			type: "city",
			country: "BO",
			slug: `uyuni-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Tour Salar",
			productType: "Tour",
			destinationId: `dest_${suffix}`,
		})

		const repo = new SubtypeRepository()
		await repo.insertTourStandalone({
			productId,
			duration: "1 dia",
			durationMinutes: 1440,
			difficultyLevel: "Facil",
			meetingPointJson: { address: "Plaza principal", instructions: "Llegar 15 minutos antes" },
			itineraryJson: [{ step: 1, description: "Salar de Uyuni" }],
			safetyJson: { requirements: "Protector solar", warnings: "Altura" },
			guideJson: { languages: "es, en", guideType: "Guia local" },
			includesJson: ["Transporte", "Guia"],
			excludesJson: ["Propinas"],
			categoriesJson: ["Adventure", "Wildlife"],
			pickupJson: { defaultArea: "Hoteles centro", instructions: "Recojo 07:30" },
		})

		const row = await db
			.select()
			.from(Tour)
			.where(eq(Tour.productId, productId))
			.then((rows) => rows[0])
		expect(row?.meetingPointJson).toMatchObject({ address: "Plaza principal" })
		expect(row?.itineraryJson).toEqual([{ step: 1, description: "Salar de Uyuni" }])
		expect(row?.safetyJson).toMatchObject({ warnings: "Altura" })
		expect(row?.guideJson).toMatchObject({ guideType: "Guia local" })
		expect(row?.durationMinutes).toBe(1440)
		expect(row?.includesJson).toEqual(["Transporte", "Guia"])
		expect(row?.excludesJson).toEqual(["Propinas"])
		expect(row?.categoriesJson).toEqual(["Adventure", "Wildlife"])
		expect(row?.pickupJson).toMatchObject({ defaultArea: "Hoteles centro" })
	})

	it("adds Limousine as a first-class vertical with vehicle and capacity profile", async () => {
		const suffix = crypto.randomUUID()
		const productId = `limo_${suffix}`
		await upsertDestination({
			id: `dest_${suffix}`,
			name: "Santa Cruz",
			type: "city",
			country: "BO",
			slug: `santa-cruz-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Limusina aeropuerto",
			productType: "Limousine",
			destinationId: `dest_${suffix}`,
		})

		const repo = new SubtypeRepository()
		await repo.insertLimousineStandalone({
			productId,
			vehicleProfileJson: { make: "Mercedes-Benz", model: "Clase S", class: "Ejecutivo" },
			pickupJson: { defaultArea: "Aeropuerto" },
			dropoffJson: { defaultArea: "Centro" },
			passengerCapacity: 3,
			luggageCapacity: 2,
		})

		const row = await db
			.select()
			.from(Limousine)
			.where(eq(Limousine.productId, productId))
			.then((rows) => rows[0])
		expect(normalizeProductTypeForStorage("limusina")).toBe("Limousine")
		expect(PRODUCT_VERTICALS.limousine.variantKind).toBe("limousine_service")
		expect(row?.vehicleProfileJson).toMatchObject({ model: "Clase S" })
		expect(row?.passengerCapacity).toBe(3)
		expect(row?.luggageCapacity).toBe(2)
	})

	it("marks Tour ready only when quality floors and sellable schedule are met", async () => {
		const suffix = crypto.randomUUID()
		const productId = `tour_ready_${suffix}`
		const slotId = `tour_slot_${suffix}`
		const categoryId = `cat_tour_ready_${suffix}`
		await seedReadyCatalogBase({
			productId,
			productType: "Tour",
			destinationId: `dest_tour_ready_${suffix}`,
		})
		// Start at 4 photos (seedReadyCatalogBase inserts 1) — below publish floor.
		for (let i = 1; i < TOUR_QUALITY_MIN_IMAGES - 1; i += 1) {
			await db.insert(Image).values({
				id: `img_${productId}_${i}`,
				entityType: "product",
				entityId: productId,
				objectKey: `products/${productId}_${i}.jpg`,
				url: `https://example.com/image-${i}.jpg`,
				isPrimary: false,
				order: i,
			})
		}
		const repo = new SubtypeRepository()
		await repo.insertTourStandalone({
			productId,
			duration: "3 horas",
			durationMinutes: 180,
			meetingPointJson: { address: "Plaza principal" },
			itineraryJson: [
				{ step: 1, description: "Encuentro" },
				{ step: 2, description: "Recorrido historico" },
				{ step: 3, description: "Cierre" },
			],
			includesJson: ["Guia", "Entradas"],
			safetyJson: { requirements: "Calzado comodo" },
			guideJson: { languages: "es" },
		})
		await db.insert(ProductCategory).values({
			id: categoryId,
			slug: `city-tour-${suffix}`,
			name: "City Tour",
			vertical: "tour",
			sortOrder: 1,
			isActive: true,
			createdAt: new Date(),
		})
		await db.insert(ProductCategoryLink).values({
			id: `pcl_${suffix}`,
			productId,
			categoryId,
			createdAt: new Date(),
		})
		await db.insert(TourTicketType).values({
			id: `ttt_${suffix}`,
			productId,
			code: "adult",
			label: "Adulto",
			sortOrder: 0,
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		})

		let evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("draft")
		expect(evaluated.validationErrors.some((e) => e.code === "missing_tour_schedule")).toBe(true)

		await db.insert(Variant).values({
			id: slotId,
			productId,
			name: "Salida 09:00",
			kind: "tour_slot",
			status: "draft",
			isActive: false,
		})

		// Bare / incomplete / inactive salida is not enough (aligned with admin quality).
		evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("draft")
		expect(evaluated.validationErrors.some((e) => e.code === "missing_tour_schedule")).toBe(true)

		await db.insert(TourSlotProfile).values({
			variantId: slotId,
			departureTime: "09:00",
			maxPax: 12,
			languageCode: "es",
			bookingMode: "shared",
			isActive: true,
		})
		await db.insert(VariantCapacity).values({
			variantId: slotId,
			minOccupancy: 1,
			maxOccupancy: 12,
			maxAdults: 12,
			maxChildren: null,
		})
		await db.insert(RatePlan).values({
			id: `rp_${suffix}`,
			variantId: slotId,
			name: "Standard",
			isDefault: true,
			isActive: true,
			createdAt: new Date(),
		})

		// Still inactive → still missing schedule (quality requires active complete salida).
		evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("draft")
		expect(evaluated.validationErrors.some((e) => e.code === "missing_tour_schedule")).toBe(true)

		await db
			.update(Variant)
			.set({ isActive: true, status: "ready" } as any)
			.where(eq(Variant.id, slotId))

		// 4 photos + full content/salida still blocks (shared quality floor).
		evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("draft")
		expect(evaluated.validationErrors.some((e) => e.code === "missing_tour_images")).toBe(true)
		expect(evaluated.validationErrors.some((e) => e.code === "missing_tour_schedule")).toBe(false)

		await db.insert(Image).values({
			id: `img_${productId}_5`,
			entityType: "product",
			entityId: productId,
			objectKey: `products/${productId}_5.jpg`,
			url: "https://example.com/image-5.jpg",
			isPrimary: false,
			order: 4,
		})

		// 5 photos + 3 steps + includes/category/tickets/active salida → ready.
		evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("ready")
		expect(evaluated.validationErrors).toEqual([])
	}, 30000)

	it("marks Package ready when duration, itinerary and inclusions exist", async () => {
		const suffix = crypto.randomUUID()
		const productId = `package_ready_${suffix}`
		await seedReadyCatalogBase({
			productId,
			productType: "Package",
			destinationId: `dest_package_ready_${suffix}`,
		})
		const repo = new SubtypeRepository()
		await repo.insertPackageStandalone({
			productId,
			days: 3,
			nights: 2,
			itineraryJson: [{ day: 1, description: "Llegada" }],
			includesJson: ["Hotel", "Traslado"],
			excludesJson: ["Propinas"],
		})

		const evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("ready")
		expect(evaluated.validationErrors).toEqual([])
	})

	it("marks Limousine ready when vehicle, pickup/dropoff and capacity exist", async () => {
		const suffix = crypto.randomUUID()
		const productId = `limousine_ready_${suffix}`
		await seedReadyCatalogBase({
			productId,
			productType: "Limousine",
			destinationId: `dest_limousine_ready_${suffix}`,
		})
		const repo = new SubtypeRepository()
		await repo.insertLimousineStandalone({
			productId,
			vehicleProfileJson: { make: "Mercedes-Benz", model: "Clase S" },
			pickupJson: { defaultArea: "Aeropuerto" },
			dropoffJson: { defaultArea: "Centro" },
			passengerCapacity: 3,
			luggageCapacity: 2,
		})

		const evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("ready")
		expect(evaluated.validationErrors).toEqual([])
	})
})
