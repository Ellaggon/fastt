import type { APIRoute } from "astro"
import { db, eq, and, Product, Variant, RatePlan, TaxFee, RoomType } from "astro:db"

import { checkAvailability } from "@/core/availability/availability.service"
import { selectRatePlans } from "@/core/rate-plans/ratePlan.selector"
import { calculatePrice } from "@/core/pricing/pricing.engine"
import { calculateTaxesAndFees } from "@/core/tax-fee/calculateTaxFee"
import { normalizeSearchResults } from "@/core/search/search.normalizer"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const {
		destinationId,
		productId,
		checkIn,
		checkOut,
		adults,
		children = 0,
		currency = "USD",
	} = body

	if ((!destinationId && !productId) || !checkIn || !checkOut || !adults) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	const nights =
		(new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)

	if (nights <= 0) {
		return new Response(JSON.stringify({ error: "Invalid dates" }), { status: 400 })
	}

	// 🔹 RAW RESULTS (antes de normalizar)
	const rawResults: any[] = []

	// 1️⃣ Productos por destino
	const products = productId
		? await db.select().from(Product).where(eq(Product.id, productId))
		: await db.select().from(Product).where(eq(Product.destinationId, destinationId))

	for (const product of products) {
		// 2️⃣ Variants (habitaciones / opciones)
		const variants = await db.select().from(Variant).where(eq(Variant.productId, product.id))

		for (const variant of variants) {
			if (!variant.entityId) continue

			// 3️⃣ Rate Plans válidos (FASE 2)
			const validPlans = await selectRatePlans({
				variantId: variant.id,
				checkIn: new Date(checkIn),
				checkOut: new Date(checkOut),
			})

			for (const rp of validPlans) {
				const fullRatePlan = await db.select().from(RatePlan).where(eq(RatePlan.id, rp.id)).get()

				if (!fullRatePlan || !fullRatePlan.isActive) continue

				// 4️⃣ Availability (FASE 1)
				const availability = await checkAvailability({
					hotelRoomTypeId: variant.entityId,
					ratePlanId: fullRatePlan.id,
					checkIn,
					checkOut,
					quantity: 1,
				})

				if (!availability.available) continue

				// 5️⃣ Pricing Engine (FASE 3)
				const appliedRatePlan = {
					id: fullRatePlan.id,
					type: fullRatePlan.type as "base" | "fixed" | "modifier" | "package" | "percentage",
					valueUSD: fullRatePlan.valueUSD,
					valueBOB: fullRatePlan.valueBOB,
				}

				const pricing = calculatePrice(
					{
						basePriceUSD: variant.basePriceUSD,
						basePriceBOB: variant.basePriceBOB,
						nights,
					},
					appliedRatePlan,
					currency
				)

				// 6️⃣ Taxes & Fees (FASE 4)
				const taxFees = await db
					.select()
					.from(TaxFee)
					.where(and(eq(TaxFee.productId, product.id), eq(TaxFee.isActive, true)))

				const finalPrice = calculateTaxesAndFees({
					pricingResult: {
						baseAmount: pricing.total,
						nights,
						guests: adults + children,
						currency,
					},
					taxFees,
				})

				// 🔹 Resultado crudo (NO normalizado)
				rawResults.push({
					product: {
						id: product.id,
						name: product.name,
					},
					roomType: {
						id: variant.entityId,
						name: variant.name,
					},
					ratePlan: {
						id: fullRatePlan.id,
						name: fullRatePlan.name,
						refundable: fullRatePlan.refundable,
						isDefault: rp.isDefault,
					},
					pricing,
					taxes: finalPrice,
				})
			}
		}
	}

	// 7️⃣ NORMALIZACIÓN (FASE 5.4)
	const response = {
		currency,
		checkIn,
		checkOut,
		nights,
		results: normalizeSearchResults(rawResults),
	}

	return new Response(JSON.stringify(response), { status: 200 })
}
