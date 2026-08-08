/**
 * Hotel → tours cross-sell: destination + stay dates → available tour cards.
 */
import { getTourSearchSurface, type TourSearchCard } from "@/lib/tours/tourSearchSurface"

export type TourCrossSellResult = {
	cards: TourSearchCard[]
	departureDate: string
	destinationId: string | null
	surface: "hotel_pdp" | "guest_trip" | "hotel_confirmation"
}

function toDateOnly(value: string | Date | null | undefined): string | null {
	if (!value) return null
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null
		return value.toISOString().slice(0, 10)
	}
	const raw = String(value).trim().slice(0, 10)
	return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

/** Prefer first stay night; fall back to checkout−1 / today. */
export function resolveCrossSellDepartureDate(params: {
	checkIn?: string | Date | null
	checkOut?: string | Date | null
	preferredDate?: string | Date | null
}): string {
	const preferred = toDateOnly(params.preferredDate)
	if (preferred) return preferred
	const checkIn = toDateOnly(params.checkIn)
	if (checkIn) return checkIn
	const checkOut = toDateOnly(params.checkOut)
	if (checkOut) {
		const d = new Date(`${checkOut}T00:00:00.000Z`)
		d.setUTCDate(d.getUTCDate() - 1)
		return d.toISOString().slice(0, 10)
	}
	return new Date().toISOString().slice(0, 10)
}

export async function loadHotelTourCrossSell(params: {
	destinationId: string | null | undefined
	checkIn?: string | Date | null
	checkOut?: string | Date | null
	preferredDate?: string | Date | null
	surface: TourCrossSellResult["surface"]
	limit?: number
	excludeProductId?: string | null
}): Promise<TourCrossSellResult> {
	const destinationId = String(params.destinationId ?? "").trim() || null
	const departureDate = resolveCrossSellDepartureDate(params)
	if (!destinationId) {
		return { cards: [], departureDate, destinationId: null, surface: params.surface }
	}

	const surface = await getTourSearchSurface({
		startDate: departureDate,
		destinationRowId: destinationId,
		sort: "rating_desc",
		limit: Math.max(1, Math.min(Number(params.limit ?? 4) || 4, 8)),
	})

	const exclude = String(params.excludeProductId ?? "").trim()
	const cards = surface.cards.filter((card) => !exclude || card.productId !== exclude)

	return {
		cards,
		departureDate,
		destinationId,
		surface: params.surface,
	}
}
