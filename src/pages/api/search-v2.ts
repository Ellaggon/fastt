import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { listMarketplaceHotelsByDestination } from "@/modules/catalog/public"
import { searchOffers } from "@/container"

const schema = z.object({
	destinationId: z.string().trim().min(1),
	checkIn: z.string().trim().min(1),
	checkOut: z.string().trim().min(1),
	rooms: z.coerce.number().int().min(1).default(1),
	adults: z.coerce.number().int().min(0).default(2),
	children: z.coerce.number().int().min(0).default(0),
})

function parseISODate(s: string): Date | null {
	const d = new Date(s)
	return Number.isNaN(d.getTime()) ? null : d
}

export type SearchV2Result = {
	productId: string
	name: string
	destinationId: string
	heroImage?: string
	fromPrice: number
	basePrice: number
	totalPrice: number
	currency: string
	available: boolean
	availableVariants: number
	taxes: {
		hasIncluded: boolean
		hasExcluded: boolean
	}
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url)
		const parsed = schema.parse({
			destinationId: url.searchParams.get("destinationId") ?? "",
			checkIn: url.searchParams.get("checkIn") ?? "",
			checkOut: url.searchParams.get("checkOut") ?? "",
			rooms: url.searchParams.get("rooms") ?? undefined,
			adults: url.searchParams.get("adults") ?? undefined,
			children: url.searchParams.get("children") ?? undefined,
		})

		const checkIn = parseISODate(parsed.checkIn)
		const checkOut = parseISODate(parsed.checkOut)
		if (!checkIn || !checkOut || checkOut <= checkIn) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["dates"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		// Candidate products by destination (catalog-level).
		const candidates = await listMarketplaceHotelsByDestination({
			destinationId: parsed.destinationId,
			limit: 50,
		})

		const results: SearchV2Result[] = []

		for (const c of candidates) {
			const offers = await searchOffers({
				productId: c.productId,
				checkIn,
				checkOut,
				rooms: parsed.rooms,
				adults: parsed.adults,
				children: parsed.children,
			})

			if (!offers.length) continue

			// Exclude variants that have no rate plans or missing/zero base price.
			const validOffers = offers
				.filter((o) => (o.ratePlans?.length ?? 0) > 0)
				.filter((o) => Number(o.variant?.pricing?.basePrice ?? 0) > 0)

			if (!validOffers.length) continue

			// Compute "fromPrice" across all variants + rate plans (stay total).
			let fromPrice = Infinity
			let basePrice = 0
			let totalPrice = 0
			let hasIncluded = false
			let hasExcluded = false
			for (const o of validOffers) {
				for (const rp of o.ratePlans) {
					const total = Number(rp.totalPrice ?? 0)
					if (total > 0 && total < fromPrice) {
						fromPrice = total
						basePrice = Number(rp.finalPrice ?? 0)
						totalPrice = total
						hasIncluded =
							(rp.taxesAndFees?.taxes?.included?.length ?? 0) > 0 ||
							(rp.taxesAndFees?.fees?.included?.length ?? 0) > 0
						hasExcluded =
							(rp.taxesAndFees?.taxes?.excluded?.length ?? 0) > 0 ||
							(rp.taxesAndFees?.fees?.excluded?.length ?? 0) > 0
					}
				}
			}

			if (!Number.isFinite(fromPrice) || fromPrice <= 0) continue

			results.push({
				productId: c.productId,
				name: c.name,
				destinationId: c.destinationId,
				heroImage: c.heroImageUrl ?? undefined,
				fromPrice,
				basePrice,
				totalPrice,
				currency: "USD",
				available: true,
				availableVariants: validOffers.length,
				taxes: { hasIncluded, hasExcluded },
			})
		}

		results.sort((a, b) => a.fromPrice - b.fromPrice)

		return new Response(JSON.stringify({ results }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
