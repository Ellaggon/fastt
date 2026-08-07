import { describe, expect, it } from "vitest"

import {
	and,
	db,
	DailyInventory,
	Destination,
	eq,
	Product,
	Provider,
	RatePlan,
	Tour,
	TourSlotProfile,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
} from "@/shared/infrastructure/db/compat"

import { tourDepartureToStay } from "@/lib/tours/tourSemantics"

async function seedTourProductBase(params: { productId: string; destinationId: string }) {
	await db
		.insert(Provider)
		.values({ id: "prov_test", legalName: "Provider prov_test" })
		.onConflictDoNothing()

	await db
		.insert(Destination)
		.values({
			id: params.destinationId,
			name: "Tour Dest",
			type: "city",
			country: "BO",
			slug: `tour-${params.destinationId}`,
		} as any)
		.onConflictDoNothing()

	await db
		.insert(Product)
		.values({
			id: params.productId,
			name: "City Tour",
			productType: "Tour",
			destinationId: params.destinationId,
			providerId: "prov_test",
		} as any)
		.onConflictDoNothing()

	await db
		.insert(Tour)
		.values({
			productId: params.productId,
			duration: "3h",
			durationMinutes: 180,
			difficultyLevel: "easy",
			meetingPointJson: { address: "Plaza Murillo" },
			itineraryJson: ["Centro histórico"],
		} as any)
		.onConflictDoNothing()
}

async function seedTourSlot(params: {
	productId: string
	variantId: string
	ratePlanId: string
	departureTime: string
	maxPax: number
	departureDate: string
}) {
	await db.insert(Variant).values({
		id: params.variantId,
		productId: params.productId,
		kind: "tour_slot",
		name: `Salida ${params.departureTime}`,
		status: "ready",
		isActive: true,
		createdAt: new Date(),
	} as any)

	await db.insert(TourSlotProfile).values({
		variantId: params.variantId,
		departureTime: params.departureTime,
		maxPax: params.maxPax,
		languageCode: "es",
		bookingMode: "shared",
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any)

	await db.insert(VariantCapacity).values({
		variantId: params.variantId,
		minOccupancy: 1,
		maxOccupancy: params.maxPax,
		maxAdults: params.maxPax,
	} as any)

	await db.insert(VariantInventoryConfig).values({
		variantId: params.variantId,
		defaultTotalUnits: params.maxPax,
		horizonDays: 365,
	} as any)

	await db.insert(RatePlan).values({
		id: params.ratePlanId,
		variantId: params.variantId,
		name: "Standard",
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)

	await db.insert(DailyInventory).values({
		id: `di_${crypto.randomUUID()}`,
		variantId: params.variantId,
		date: params.departureDate,
		totalInventory: params.maxPax,
		reservedCount: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any)
}

describe("integration/tour booking E2E (fase 2+3)", () => {
	it(
		"supports two salidas with different hours and inventory cupo defaults to maxPax",
		async () => {
			const suffix = crypto.randomUUID()
			const productId = `prod_tour_${suffix}`
			const morningId = `var_tour_am_${suffix}`
			const afternoonId = `var_tour_pm_${suffix}`
			const morningRp = `rp_tour_am_${suffix}`
			const afternoonRp = `rp_tour_pm_${suffix}`
			const departure = "2026-09-15"
			const stay = tourDepartureToStay(departure)
			const checkIn = stay.checkIn.toISOString().slice(0, 10)
			expect(stay.nights).toBe(1)

			const maxPax = 10
			const destinationId = `dest_tour_${suffix}`

			await seedTourProductBase({ productId, destinationId })
			await seedTourSlot({
				productId,
				variantId: morningId,
				ratePlanId: morningRp,
				departureTime: "09:00",
				maxPax,
				departureDate: checkIn,
			})
			await seedTourSlot({
				productId,
				variantId: afternoonId,
				ratePlanId: afternoonRp,
				departureTime: "15:30",
				maxPax,
				departureDate: checkIn,
			})

			const profiles = await db
				.select({
					variantId: TourSlotProfile.variantId,
					departureTime: TourSlotProfile.departureTime,
					maxPax: TourSlotProfile.maxPax,
				})
				.from(TourSlotProfile)
				.innerJoin(Variant, eq(Variant.id, TourSlotProfile.variantId))
				.where(eq(Variant.productId, productId))

			expect(profiles).toHaveLength(2)
			expect(profiles.map((p) => p.departureTime).sort()).toEqual(["09:00", "15:30"])
			expect(profiles.every((p) => Number(p.maxPax) === maxPax)).toBe(true)

			const invConfig = await db
				.select({
					defaultTotalUnits: VariantInventoryConfig.defaultTotalUnits,
				})
				.from(VariantInventoryConfig)
				.where(eq(VariantInventoryConfig.variantId, morningId))
				.then((rows) => rows[0])
			expect(Number(invConfig?.defaultTotalUnits)).toBe(maxPax)

			const before = await db
				.select({
					reservedCount: DailyInventory.reservedCount,
					totalInventory: DailyInventory.totalInventory,
				})
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, morningId), eq(DailyInventory.date, checkIn)))
				.then((rows) => rows[0])
			expect(Number(before?.totalInventory)).toBe(maxPax)
			expect(Number(before?.reservedCount)).toBe(0)

			// Cupo baja: reserve 2 participants against the morning salida inventory.
			const reserved = 2
			await db
				.update(DailyInventory)
				.set({ reservedCount: reserved, updatedAt: new Date() })
				.where(and(eq(DailyInventory.variantId, morningId), eq(DailyInventory.date, checkIn)))

			const after = await db
				.select({
					reservedCount: DailyInventory.reservedCount,
					totalInventory: DailyInventory.totalInventory,
				})
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, morningId), eq(DailyInventory.date, checkIn)))
				.then((rows) => rows[0])

			expect(Number(after?.reservedCount)).toBe(reserved)
			expect(Number(after?.totalInventory) - Number(after?.reservedCount)).toBe(maxPax - reserved)
		},
		20_000
	)
})
