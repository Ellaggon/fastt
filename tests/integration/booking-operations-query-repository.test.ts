import {
	Booking,
	BookingPolicySnapshot,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	PaymentTransaction,
} from "astro:db"
import { describe, expect, it } from "vitest"

import { bookingOperationsQueryRepository } from "@/modules/booking/public"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("BookingOperationsQueryRepository", () => {
	it("reads provider-owned contract, operations, payments and snapshots from one boundary", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `provider_booking_ops_${suffix}`
		const destinationId = `destination_booking_ops_${suffix}`
		const productId = `product_booking_ops_${suffix}`
		const variantId = `variant_booking_ops_${suffix}`
		const templateId = `template_booking_ops_${suffix}`
		const ratePlanId = `rate_booking_ops_${suffix}`
		const bookingId = `booking_ops_${suffix}`

		await upsertDestination({
			id: destinationId,
			name: "Santiago",
			type: "city",
			country: "CL",
			slug: `santiago-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Hotel Operaciones",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({ id: variantId, productId, name: "Suite" })
		await upsertRatePlanTemplate({ id: templateId, name: "Flexible" })
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true })

		await db.insert(Booking).values({
			id: bookingId,
			providerId,
			ratePlanId,
			checkInDate: "2999-06-22",
			checkOutDate: "2999-06-24",
			totalAmount: 120,
			currency: "USD",
			status: "confirmed",
			operationalStatus: "pending_arrival",
			guestNameSnapshot: "Ana Hotelera",
			guestEmailSnapshot: "ana@example.com",
			contractSnapshotVersion: "booking-v1",
		} as any)
		await db.insert(BookingRoomDetail).values({
			id: `detail_${suffix}`,
			bookingId,
			variantId,
			ratePlanId,
			checkIn: "2999-06-22",
			checkOut: "2999-06-24",
			adults: 2,
			children: 0,
			subtotalAmount: 100,
			taxAmount: 20,
			totalAmount: 120,
			pricingBreakdownJson: { totalAmount: 120 },
			providerIdSnapshot: providerId,
			productIdSnapshot: productId,
			productNameSnapshot: "Hotel Operaciones",
			variantNameSnapshot: "Suite",
			ratePlanNameSnapshot: "Flexible",
			occupancySnapshotJson: { occupancyDetail: { adults: 2, children: 0, infants: 0 } },
		} as any)
		await db.insert(BookingPolicySnapshot).values({
			id: `policy_${suffix}`,
			bookingId,
			category: "Cancellation",
			policySnapshotJson: { description: "Flexible" },
		} as any)
		await db.insert(BookingTaxFee).values({
			id: `tax_${suffix}`,
			bookingId,
			name: "IVA",
			breakdownJson: { amount: 20 },
			totalAmount: 20,
		} as any)
		await db.insert(PaymentTransaction).values({
			id: `payment_${suffix}`,
			bookingId,
			providerId,
			type: "capture",
			status: "recorded",
			amount: 50,
			currency: "USD",
			externalReference: `capture-${suffix}`,
			pspProvider: "test",
			idempotencyKey: `capture-${suffix}`,
			occurredAt: new Date(),
			source: "test",
		} as any)

		const list = await bookingOperationsQueryRepository.listByProvider({ providerId })
		expect(list.items).toHaveLength(1)
		expect(list.items[0]).toMatchObject({
			bookingId,
			totalAmount: 120,
			lifecycleState: "upcoming_arrival",
			payment: { paidAmount: 50, pendingAmount: 70, state: "partially_paid" },
		})

		const detail = await bookingOperationsQueryRepository.getById({ providerId, bookingId })
		expect(detail?.booking).toMatchObject({
			id: bookingId,
			totalAmount: 120,
			payment: { paidAmount: 50, pendingAmount: 70 },
		})
		expect(detail?.allocations[0]).toMatchObject({
			subtotalAmount: 100,
			taxAmount: 20,
			totalAmount: 120,
		})
		expect(detail?.policies).toHaveLength(1)
		expect(detail?.taxes).toHaveLength(1)
	})
})
