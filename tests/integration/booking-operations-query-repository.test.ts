import {
	Booking,
	BookingPolicySnapshot,
	BookingLineItem,
	BookingTaxFee,
	db,
	PaymentTransaction,
} from "@/shared/infrastructure/db/compat"
import { describe, expect, it } from "vitest"

import { bookingOperationsQueryRepository } from "@/modules/booking/public"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("BookingOperationsQueryRepository", () => {
	it("reads provider-owned contract, operations, payments and snapshots from one boundary", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `provider_booking_ops_${suffix}`
		const geoPlaceId = `destination_booking_ops_${suffix}`
		const productId = `product_booking_ops_${suffix}`
		const variantId = `variant_booking_ops_${suffix}`
		const templateId = `template_booking_ops_${suffix}`
		const ratePlanId = `rate_booking_ops_${suffix}`
		const bookingId = `booking_ops_${suffix}`

		await upsertGeoPlace({
			id: geoPlaceId,
			name: "Santiago",
			type: "city",
			country: "CL",
			slug: `santiago-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Hotel Operaciones",
			productType: "Hotel",
			geoPlaceId,
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
		await db.insert(BookingLineItem).values({
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

describe("tour departure day query", () => {
	it("filters date, vertical and option before pagination, preserving next-day ends", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `provider_day_${suffix}`
		const geoPlaceId = `geo_day_${suffix}`
		await upsertGeoPlace({
			id: geoPlaceId,
			name: "La Paz",
			type: "city",
			country: "BO",
			slug: `day-${suffix}`,
		})
		const products = ["Tour", "Hotel"]
		for (const type of products) {
			const productId = `${type}_day_${suffix}`
			const variantId = `variant_${productId}`
			const templateId = `template_${productId}`
			const ratePlanId = `rate_${productId}`
			await upsertProduct({ id: productId, name: type, productType: type, geoPlaceId, providerId })
			await upsertVariant({ id: variantId, productId, name: "Opción" })
			await upsertRatePlanTemplate({ id: templateId, name: "Estándar" })
			await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true })
			for (let index = 0; index < 3; index++) {
				const bookingId = `booking_${type}_${index}_${suffix}`
				const checkIn = index === 2 ? "2999-06-23" : "2999-06-22"
				await db
					.insert(Booking)
					.values({
						id: bookingId,
						providerId,
						ratePlanId,
						checkInDate: checkIn,
						checkOutDate: "2999-06-24",
						totalAmount: 100,
						currency: "BOB",
						status: "confirmed",
					})
				await db
					.insert(BookingLineItem)
					.values({
						id: `line_${bookingId}`,
						bookingId,
						variantId,
						ratePlanId,
						checkIn,
						checkOut: "2999-06-24",
						adults: 1,
						children: 0,
						subtotalAmount: 100,
						taxAmount: 0,
						totalAmount: 100,
						productIdSnapshot: productId,
					})
			}
		}
		const query = {
			providerId,
			vertical: "tour",
			departureDate: "2999-06-22",
			status: "confirmed",
			limit: 1,
		}
		const firstPage = await bookingOperationsQueryRepository.listByProvider(query)
		const secondPage = await bookingOperationsQueryRepository.listByProvider({
			...query,
			offset: 1,
		})
		expect(firstPage.pagination).toMatchObject({ total: 2, hasMore: true })
		expect(secondPage.pagination).toMatchObject({ total: 2, hasMore: false })
		expect(firstPage.items[0].bookingId).not.toBe(secondPage.items[0].bookingId)
		for (const item of [...firstPage.items, ...secondPage.items]) {
			expect(item).toMatchObject({
				vertical: "tour",
				checkIn: "2999-06-22",
				checkOut: "2999-06-24",
			})
		}
		const wrongOption = await bookingOperationsQueryRepository.listByProvider({
			...query,
			variantId: `variant_Hotel_day_${suffix}`,
		})
		expect(wrongOption.pagination.total).toBe(0)
		expect(wrongOption.items).toEqual([])
	})
})
