import { db, eq, Variant, RatePlan, InventoryLock, TaxFee, Booking, BookingTaxFee } from "astro:db"

import { checkAvailability } from "@/core/availability/availability.service"
import { calculatePrice } from "@/core/pricing/pricing.engine"
import { calculateTaxesAndFees } from "@/core/tax-fee/calculateTaxFee"

import { validateBookingInput } from "./booking.validator"
import { lockInventory } from "./booking.lock"
import { AvailabilityError, PriceMismatchError } from "./booking.errors"

import type { CreateBookingInput, BookingResult } from "./booking.types"

export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
	validateBookingInput(input)

	const {
		productId,
		variantId,
		ratePlanId,
		checkIn,
		checkOut,
		adults,
		children,
		currency,
		quotedTotal,
	} = input

	const nights =
		(new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)

	const lock = await lockInventory(`${variantId}:${checkIn}:${checkOut}`)

	try {
		// 1️⃣ Variant
		const variant = await db.select().from(Variant).where(eq(Variant.id, variantId)).get()

		if (!variant || !variant.entityId) {
			throw new AvailabilityError()
		}

		// 2️⃣ Availability (recheck)
		const availability = await checkAvailability({
			hotelRoomTypeId: variant.entityId,
			ratePlanId,
			checkIn,
			checkOut,
			quantity: 1,
		})

		if (!availability.available) {
			throw new AvailabilityError()
		}

		// 3️⃣ RatePlan
		const ratePlan = await db.select().from(RatePlan).where(eq(RatePlan.id, ratePlanId)).get()

		if (!ratePlan) {
			throw new AvailabilityError()
		}

		// 4️⃣ Pricing
		const pricing = calculatePrice(
			{
				basePriceUSD: variant.basePriceUSD,
				basePriceBOB: variant.basePriceBOB,
				nights,
			},
			{
				id: ratePlan.id,
				type: ratePlan.type as any,
				valueUSD: ratePlan.valueUSD,
				valueBOB: ratePlan.valueBOB,
			},
			currency
		)

		const taxFees = await db.select().from(TaxFee).where(eq(TaxFee.productId, productId))

		const finalPrice = calculateTaxesAndFees({
			pricingResult: {
				baseAmount: pricing.total,
				nights,
				guests: adults + children,
				currency,
			},
			taxFees,
		})

		// 5️⃣ Price mismatch protection
		if (Math.abs(finalPrice.total - quotedTotal) > 0.01) {
			throw new PriceMismatchError()
		}

		// 6️⃣ Persist booking (CORRECT FIELDS)
		const booking = await db
			.insert(Booking)
			.values({
				productId,
				bookingDate: new Date(),
				checkInDate: new Date(checkIn),
				checkOutDate: new Date(checkOut),
				numAdults: adults,
				numChildren: children,
				totalAmountUSD: currency === "USD" ? finalPrice.total : null,
				totalAmountBOB: currency === "BOB" ? finalPrice.total : null,
				status: "locked",
				currency,
			})
			.returning()
			.get()

		const inventoryLock = await db.insert(InventoryLock).values({
			id: crypto.randomUUID(),
			bookingId: booking.id, // o se setea luego
			hotelRoomTypeId: variant.entityId,
			checkInDate: new Date(checkIn),
			checkOutDate: new Date(checkOut),
			quantity: 1,
			status: "locked",
			expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
		})

		for (const tax of finalPrice.taxes) {
			await db.insert(BookingTaxFee).values({
				id: crypto.randomUUID(),
				name: tax.name,
				type: tax.type,
				isIncluded: tax.included,
				bookingId: booking.id,
				taxFeeId: tax.id,
				amountUSD: currency === "USD" ? tax.amount : null,
				amountBOB: currency === "BOB" ? tax.amount : null,
			})
		}

		return {
			id: booking.id,
			status: "locked",
			total: finalPrice.total,
			currency,
		}
	} finally {
		await lock.release()
	}
}
