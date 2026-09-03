import "dotenv/config"

import { describe, expect, it } from "vitest"

import { FinancialBookingCandidateRepository } from "@/modules/financial/infrastructure/repositories/FinancialBookingCandidateRepository"
import {
	Booking,
	BookingLineItem,
	db,
	PaymentTransaction,
	Product,
	Provider,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const isolated = process.env.FASTT_DATA_ENV === "test" ? prepareIsolatedTestDatabase() : { configured: false as const }
const describePostgres = isolated.configured ? describe : describe.skip
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function fixtureIds() {
	const suffix = crypto.randomUUID()
	return {
		provider: `provider_fin_${suffix}`,
		otherProvider: `provider_fin_other_${suffix}`,
		product: `product_fin_${suffix}`,
		variant: `variant_fin_${suffix}`,
		ratePlan: `rate_fin_${suffix}`,
		booking: `booking_fin_${suffix}`,
		otherBooking: `booking_fin_other_${suffix}`,
		payment: `payment_fin_${suffix}`,
	}
}

async function seed(tx: Transaction, ids: ReturnType<typeof fixtureIds>) {
	await tx.insert(Provider).values([
		{ id: ids.provider, legalName: "Financial integrity provider" },
		{ id: ids.otherProvider, legalName: "Other financial provider" },
	])
	await tx.insert(Product).values({
		id: ids.product,
		name: "Financial fixture",
		productType: "hotel",
		providerId: ids.provider,
		dataClass: "fixture",
	})
	await tx.insert(Variant).values({ id: ids.variant, productId: ids.product, name: "Financial room", kind: "hotel_room" })
	await tx.insert(RatePlan).values({ id: ids.ratePlan, variantId: ids.variant, name: "Base" })
	await tx.insert(Booking).values([
		{
			id: ids.booking,
			providerId: ids.provider,
			ratePlanId: ids.ratePlan,
			checkInDate: "2026-11-10",
			checkOutDate: "2026-11-11",
			totalAmount: 100,
			currency: "USD",
			guestNameSnapshot: "Ana Financiéra",
			externalBookingId: "FIN-1001",
		},
		{
			id: ids.otherBooking,
			providerId: ids.provider,
			ratePlanId: ids.ratePlan,
			checkInDate: "2026-11-12",
			checkOutDate: "2026-11-13",
			totalAmount: 100,
			currency: "USD",
			guestNameSnapshot: "Bruno Financiero",
			externalBookingId: "FIN-1002",
		},
	])
	await tx.insert(BookingLineItem).values([
		{
			id: `line_${ids.booking}`,
			bookingId: ids.booking,
			variantId: ids.variant,
			ratePlanId: ids.ratePlan,
			checkIn: "2026-11-10",
			checkOut: "2026-11-11",
			adults: 2,
			children: 0,
			subtotalAmount: 90,
			taxAmount: 10,
			totalAmount: 100,
			productNameSnapshot: "Ritz Histórico",
			variantNameSnapshot: "Suite Ejecutiva",
		},
		{
			id: `line_${ids.otherBooking}`,
			bookingId: ids.otherBooking,
			variantId: ids.variant,
			ratePlanId: ids.ratePlan,
			checkIn: "2026-11-12",
			checkOut: "2026-11-13",
			adults: 1,
			children: 0,
			subtotalAmount: 100,
			taxAmount: 0,
			totalAmount: 100,
			productNameSnapshot: "Hotel Central",
			variantNameSnapshot: "Habitación Norte",
		},
	])
	await tx.insert(PaymentTransaction).values({
		id: ids.payment,
		bookingId: null,
		providerId: ids.provider,
		type: "capture",
		status: "visible",
		amount: 100,
		currency: "USD",
		externalReference: ids.payment,
		pspProvider: "fixture_psp",
		idempotencyKey: ids.payment,
		occurredAt: new Date(),
		source: "import",
	})
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

describePostgres("financial booking candidate search relational integrity", () => {
	it("searches only the provider's reservations by guest, external code and stay date", async () => {
		await rolledBack(async (tx, ids) => {
			const repository = new FinancialBookingCandidateRepository(
				tx as unknown as Pick<typeof db, "select" | "selectDistinctOn">
			)
			const byGuest = await repository.search({
				providerId: ids.provider,
				query: "ana financiera",
				limit: 10,
			})
			expect(byGuest.map((candidate) => candidate.id)).toEqual([ids.booking])

			const byCode = await repository.search({
				providerId: ids.provider,
				query: "fin-1002",
				limit: 10,
			})
			expect(byCode.map((candidate) => candidate.id)).toEqual([ids.otherBooking])

			const byDate = await repository.search({
				providerId: ids.provider,
				query: "2026-11-10",
				limit: 10,
			})
			expect(byDate.map((candidate) => candidate.id)).toEqual([ids.booking])

			const byProductWithoutAccents = await repository.search({
				providerId: ids.provider,
				query: "ritz historico",
				limit: 10,
			})
			expect(byProductWithoutAccents.map((candidate) => candidate.id)).toEqual([ids.booking])
			expect(byProductWithoutAccents[0]?.productName).toBe("Ritz Histórico")

			const otherProvider = await repository.search({
				providerId: ids.otherProvider,
				query: "ana",
				limit: 10,
			})
			expect(otherProvider).toEqual([])
		})
	})
})
