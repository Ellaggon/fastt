// src/application/queries/searchOffers.query.ts

import { OfferBuilderEngine } from "@/core/offers/OfferBuilderEngine"

export async function searchOffers(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	adults: number
	children: number
}) {
	const builder = new OfferBuilderEngine()

	return builder.build(params)
}
