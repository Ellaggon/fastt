import "dotenv/config"

import { describe, expect, it } from "vitest"

import {
	listScopedProviderBookingIdPage,
	type FinancialScopedDatabase,
} from "@/lib/financial/financialScopedBookingQuery"
import {
	listScopedProviderFinanceLineRows,
	loadScopedProviderFinanceLineSummary,
} from "@/lib/financial/providerFinanceLineAggregate"
import { resolveWorkspaceScope } from "@/lib/workspace/resolveWorkspaceScope"
import { FinancialBookingCandidateRepository } from "@/modules/financial/infrastructure/repositories/FinancialBookingCandidateRepository"
import {
	Booking,
	BookingLineItem,
	db,
	Product,
	Provider,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const isolated =
	process.env.FASTT_DATA_ENV === "test" ? prepareIsolatedTestDatabase() : { configured: false as const }
const describePostgres = isolated.configured ? describe : describe.skip
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function fixtureIds() {
	const suffix = crypto.randomUUID()
	return {
		provider: `provider_scope_${suffix}`,
		hotelProduct: `product_scope_hotel_${suffix}`,
		tourProduct: `product_scope_tour_${suffix}`,
		hotelVariant: `variant_scope_hotel_${suffix}`,
		tourVariant: `variant_scope_tour_${suffix}`,
		hotelRatePlan: `rate_scope_hotel_${suffix}`,
		tourRatePlan: `rate_scope_tour_${suffix}`,
		hotelBooking: `booking_scope_hotel_${suffix}`,
		tourBooking: `booking_scope_tour_${suffix}`,
		/** Snapshot says tour, live variant says hotel: the snapshot must win. */
		divergentBooking: `booking_scope_divergent_${suffix}`,
	}
}

async function seed(tx: Transaction, ids: ReturnType<typeof fixtureIds>) {
	await tx.insert(Provider).values({ id: ids.provider, legalName: "Scope integrity provider" })
	await tx.insert(Product).values([
		{
			id: ids.hotelProduct,
			name: "Hotel Scope",
			productType: "hotel",
			providerId: ids.provider,
			dataClass: "fixture",
		},
		{
			id: ids.tourProduct,
			name: "Tour Scope",
			productType: "tour",
			providerId: ids.provider,
			dataClass: "fixture",
		},
	])
	await tx.insert(Variant).values([
		{ id: ids.hotelVariant, productId: ids.hotelProduct, name: "Room", kind: "hotel_room" },
		{ id: ids.tourVariant, productId: ids.tourProduct, name: "Departure", kind: "tour_departure" },
	])
	await tx.insert(RatePlan).values([
		{ id: ids.hotelRatePlan, variantId: ids.hotelVariant, name: "Base" },
		{ id: ids.tourRatePlan, variantId: ids.tourVariant, name: "Base" },
	])
	const confirmedAt = new Date("2026-05-01T10:00:00.000Z")
	await tx.insert(Booking).values([
		{
			id: ids.hotelBooking,
			providerId: ids.provider,
			ratePlanId: ids.hotelRatePlan,
			checkInDate: "2026-11-10",
			checkOutDate: "2026-11-11",
			totalAmount: 100,
			currency: "USD",
			guestNameSnapshot: "Hotel Guest",
			confirmedAt,
		},
		{
			id: ids.tourBooking,
			providerId: ids.provider,
			ratePlanId: ids.tourRatePlan,
			checkInDate: "2026-11-12",
			checkOutDate: "2026-11-13",
			totalAmount: 200,
			currency: "USD",
			guestNameSnapshot: "Tour Guest",
			confirmedAt,
		},
		{
			id: ids.divergentBooking,
			providerId: ids.provider,
			ratePlanId: ids.hotelRatePlan,
			checkInDate: "2026-11-13",
			checkOutDate: "2026-11-14",
			totalAmount: 300,
			currency: "USD",
			guestNameSnapshot: "Divergent Guest",
			confirmedAt,
		},
	])
	await tx.insert(BookingLineItem).values([
		{
			id: `line_${ids.hotelBooking}`,
			bookingId: ids.hotelBooking,
			variantId: ids.hotelVariant,
			ratePlanId: ids.hotelRatePlan,
			checkIn: "2026-11-10",
			checkOut: "2026-11-11",
			adults: 2,
			children: 0,
			subtotalAmount: 100,
			taxAmount: 0,
			totalAmount: 100,
			productIdSnapshot: ids.hotelProduct,
			productNameSnapshot: "Hotel Scope",
			variantNameSnapshot: "Room",
		},
		{
			id: `line_${ids.tourBooking}`,
			bookingId: ids.tourBooking,
			variantId: ids.tourVariant,
			ratePlanId: ids.tourRatePlan,
			checkIn: "2026-11-12",
			checkOut: "2026-11-13",
			adults: 2,
			children: 0,
			subtotalAmount: 200,
			taxAmount: 0,
			totalAmount: 200,
			productIdSnapshot: ids.tourProduct,
			productNameSnapshot: "Tour Scope",
			variantNameSnapshot: "Departure",
		},
		{
			id: `line_${ids.divergentBooking}`,
			bookingId: ids.divergentBooking,
			variantId: ids.hotelVariant,
			ratePlanId: ids.hotelRatePlan,
			checkIn: "2026-11-13",
			checkOut: "2026-11-14",
			adults: 1,
			children: 0,
			subtotalAmount: 300,
			taxAmount: 0,
			totalAmount: 300,
			productIdSnapshot: ids.tourProduct,
			productNameSnapshot: "Tour Scope",
			variantNameSnapshot: "Departure",
		},
	])
}

async function rolledBack(run: (tx: Transaction, ids: ReturnType<typeof fixtureIds>) => Promise<void>) {
	const rollback = new Error(`rollback-${crypto.randomUUID()}`)
	try {
		await db.transaction(async (tx) => {
			const ids = fixtureIds()
			await seed(tx, ids)
			await run(tx, ids)
			throw rollback
		})
	} catch (error) {
		if (error !== rollback) throw error
	}
}

function scopeProductFilter(ids: ReturnType<typeof fixtureIds>, requestedScope: string, productId?: string) {
	const resolution = resolveWorkspaceScope({
		requestedScope,
		productId,
		productTypes: ["hotel", "tour"],
		commercialLines: ["lodging", "tour"],
		products: [
			{ id: ids.hotelProduct, name: "Hotel Scope", productType: "hotel" },
			{ id: ids.tourProduct, name: "Tour Scope", productType: "tour" },
		],
	})
	if (!resolution.valid) return { resolution, productFilter: null as string[] | null }
	if (resolution.product) return { resolution, productFilter: [resolution.product.id] }
	if (resolution.vertical) return { resolution, productFilter: resolution.productIds }
	return { resolution, productFilter: null }
}

describePostgres("financial workspace scope filters rows in the database (G2/G11)", () => {
	it("returns only the bookings of the requested line and nothing from the other line", async () => {
		await rolledBack(async (tx, ids) => {
			const database = tx as unknown as FinancialScopedDatabase
			const tour = scopeProductFilter(ids, "tour")
			const hotel = scopeProductFilter(ids, "hotel")
			const all = scopeProductFilter(ids, "all")

			const tourPage = await listScopedProviderBookingIdPage({
				providerId: ids.provider,
				productFilter: tour.productFilter,
				cursor: null,
				limit: 25,
				database,
			})
			expect(tourPage.rows.map((row) => row.bookingId).sort()).toEqual(
				[ids.tourBooking, ids.divergentBooking].sort()
			)

			const hotelPage = await listScopedProviderBookingIdPage({
				providerId: ids.provider,
				productFilter: hotel.productFilter,
				cursor: null,
				limit: 25,
				database,
			})
			expect(hotelPage.rows.map((row) => row.bookingId)).toEqual([ids.hotelBooking])

			const allPage = await listScopedProviderBookingIdPage({
				providerId: ids.provider,
				productFilter: all.productFilter,
				cursor: null,
				limit: 25,
				database,
			})
			expect(allPage.rows).toHaveLength(3)

			const none = await listScopedProviderBookingIdPage({
				providerId: ids.provider,
				productFilter: [],
				cursor: null,
				limit: 25,
				database,
			})
			expect(none.rows).toEqual([])
		})
	})

	it("rejects a product that does not belong to the requested line instead of widening the scope", () => {
		const ids = fixtureIds()
		const crossed = scopeProductFilter(ids, "hotel", ids.tourProduct)
		expect(crossed.resolution.valid).toBe(false)
		if (!crossed.resolution.valid) expect(crossed.resolution.reason).toBe("scope_product_mismatch")
	})

	it("derives the commercial line from the line item snapshot, not from the live variant", async () => {
		await rolledBack(async (tx, ids) => {
			const database = tx as unknown as FinancialScopedDatabase
			const rows = await listScopedProviderFinanceLineRows({
				providerId: ids.provider,
				productFilter: null,
				database,
			})
			const divergent = rows.find((row) => row.bookingId === ids.divergentBooking)
			expect(divergent?.productType).toBe("tour")
			expect(divergent?.productTypeFallback).toBe("hotel")

			const summary = await loadScopedProviderFinanceLineSummary({
				providerId: ids.provider,
				productFilter: null,
				commissionSnapshots: [{ bookingId: ids.tourBooking, commissionAmount: 20 }],
				payableSnapshots: [],
				database,
			})
			expect(summary).toEqual([
				expect.objectContaining({ line: "lodging", bookingCount: 1, totalGrossAmount: 100 }),
				expect.objectContaining({
					line: "tour",
					bookingCount: 2,
					totalGrossAmount: 500,
					totalCommissionAmount: 20,
					commissionSnapshotMissing: 1,
				}),
			])

			const tourOnly = await loadScopedProviderFinanceLineSummary({
				providerId: ids.provider,
				productFilter: scopeProductFilter(ids, "tour").productFilter,
				commissionSnapshots: [],
				payableSnapshots: [],
				database,
			})
			expect(tourOnly.map((row) => row.line)).toEqual(["tour"])
		})
	})

	it("limits evidence association candidates to the active scope", async () => {
		await rolledBack(async (tx, ids) => {
			const repository = new FinancialBookingCandidateRepository(
				tx as unknown as Pick<typeof db, "select" | "selectDistinctOn">
			)
			const tourCandidates = await repository.search({
				providerId: ids.provider,
				query: "guest",
				limit: 10,
				productFilter: scopeProductFilter(ids, "tour").productFilter,
			})
			expect(tourCandidates.map((candidate) => candidate.id).sort()).toEqual(
				[ids.tourBooking, ids.divergentBooking].sort()
			)
			const hotelCandidates = await repository.search({
				providerId: ids.provider,
				query: "guest",
				limit: 10,
				productFilter: scopeProductFilter(ids, "hotel").productFilter,
			})
			expect(hotelCandidates.map((candidate) => candidate.id)).toEqual([ids.hotelBooking])
			expect(
				await repository.search({ providerId: ids.provider, query: "guest", limit: 10, productFilter: [] })
			).toEqual([])
		})
	})
})
