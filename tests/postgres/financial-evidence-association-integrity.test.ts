import "dotenv/config"

import { describe, expect, it } from "vitest"

import { associateExternalFinancialEvidence } from "@/modules/financial/application/use-cases/associate-external-financial-evidence"
import { ExternalFinancialEvidenceAssociationRepository } from "@/modules/financial/infrastructure/repositories/ExternalFinancialEvidenceAssociationRepository"
import {
	Booking,
	BookingLineItem,
	db,
	eq,
	FinancialReviewEvent,
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
	await tx.insert(Product).values({ id: ids.product, name: "Financial fixture", productType: "hotel", providerId: ids.provider, dataClass: "fixture" })
	await tx.insert(Variant).values({ id: ids.variant, productId: ids.product, name: "Financial room", kind: "hotel_room" })
	await tx.insert(RatePlan).values({ id: ids.ratePlan, variantId: ids.variant, name: "Base" })
	await tx.insert(Booking).values([
		{ id: ids.booking, providerId: ids.provider, ratePlanId: ids.ratePlan, checkInDate: "2026-11-10", checkOutDate: "2026-11-11", totalAmount: 100, currency: "USD", guestNameSnapshot: "Ana Financiéra", externalBookingId: "FIN-1001" },
		{ id: ids.otherBooking, providerId: ids.provider, ratePlanId: ids.ratePlan, checkInDate: "2026-11-12", checkOutDate: "2026-11-13", totalAmount: 100, currency: "USD", guestNameSnapshot: "Bruno Financiero", externalBookingId: "FIN-1002" },
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

describePostgres("financial evidence association relational integrity", () => {
	it("associates atomically, remains idempotent and rejects reassignment", async () => {
		await rolledBack(async (tx, ids) => {
			const repository = new ExternalFinancialEvidenceAssociationRepository(tx as unknown as Pick<typeof db, "transaction">)
			const command = {
				providerId: ids.provider,
				evidenceType: "payment" as const,
				evidenceId: ids.payment,
				bookingId: ids.booking,
				actorId: "integration-test",
				reason: "Reference and amount verified",
			}
			const first = await associateExternalFinancialEvidence({ repository }, command)
			expect(first.idempotent).toBe(false)
			const second = await associateExternalFinancialEvidence({ repository }, { ...command, reason: "Retry" })
			expect(second.idempotent).toBe(true)
			const events = await tx.select().from(FinancialReviewEvent).where(eq(FinancialReviewEvent.paymentTransactionId, ids.payment))
			expect(events).toHaveLength(1)
			await expect(tx.update(PaymentTransaction).set({ bookingId: ids.otherBooking }).where(eq(PaymentTransaction.id, ids.payment))).rejects.toThrow(/FINANCIAL_EVIDENCE_BOOKING_IMMUTABLE/)
		})
	})

	it("rejects a booking and provider mismatch relationally", async () => {
		await rolledBack(async (tx, ids) => {
			await expect(
				tx.insert(PaymentTransaction).values({
					id: `payment_cross_${crypto.randomUUID()}`,
					bookingId: ids.booking,
					providerId: ids.otherProvider,
					type: "capture",
					status: "visible",
					amount: 100,
					currency: "USD",
					externalReference: `cross_${crypto.randomUUID()}`,
					pspProvider: "fixture_psp",
					idempotencyKey: `cross_${crypto.randomUUID()}`,
					occurredAt: new Date(),
					source: "import",
				})
			).rejects.toThrow(/PaymentTransaction_booking_provider_fk/)
		})
	})
})
