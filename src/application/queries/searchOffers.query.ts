// src/application/queries/searchOffers.query.ts

import { buildOffers } from "@/container"

export async function searchOffers(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	adults: number
	children: number
}) {
	return buildOffers.execute(params)
}
