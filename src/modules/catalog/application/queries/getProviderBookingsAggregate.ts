import { and, Booking, BookingRoomDetail, db, desc, eq, Product, sql, Variant } from "astro:db"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"

export type ProviderBookingsAggregateInput = {
	providerId: string
	status?: string | null
	from?: string | null
	to?: string | null
}

export type ProviderBookingSummaryItem = {
	bookingId: string
	productId: string | null
	productName: string | null
	variantId: string | null
	variantName: string | null
	checkIn: string | null
	checkOut: string | null
	totalPrice: number
	currency: string
	status: string
	createdAt: string | null
	confirmedAt: string | null
}

export type ProviderBookingsAggregate = {
	items: ProviderBookingSummaryItem[]
}

function toIso(value: unknown): string | null {
	if (!value) return null
	const date = value instanceof Date ? value : new Date(String(value))
	if (Number.isNaN(date.getTime())) return null
	return date.toISOString()
}

export async function getProviderBookingsAggregate(
	input: ProviderBookingsAggregateInput
): Promise<ProviderBookingsAggregate> {
	const providerId = String(input.providerId ?? "").trim()
	if (!providerId) return { items: [] }

	const status = String(input.status ?? "all")
		.trim()
		.toLowerCase()
	const from = String(input.from ?? "").trim()
	const to = String(input.to ?? "").trim()
	const normalizedStatus = status || "all"
	const normalizedFrom = from || "any"
	const normalizedTo = to || "any"

	return readThrough(
		cacheKeys.providerBookingsSummary(providerId, normalizedStatus, normalizedFrom, normalizedTo),
		cacheTtls.providerBookingsSummary,
		async () => {
			const filters = [eq(Product.providerId, providerId)]
			if (normalizedStatus !== "all") {
				filters.push(eq(Booking.status, normalizedStatus))
			}
			if (from) {
				filters.push(sql`${Booking.checkInDate} >= ${from}`)
			}
			if (to) {
				filters.push(sql`${Booking.checkOutDate} <= ${to}`)
			}

			const rows = await db
				.select({
					bookingId: Booking.id,
					status: Booking.status,
					currency: Booking.currency,
					totalAmountUSD: Booking.totalAmountUSD,
					totalAmountBOB: Booking.totalAmountBOB,
					bookingDate: Booking.bookingDate,
					confirmedAt: Booking.confirmedAt,
					checkInDate: Booking.checkInDate,
					checkOutDate: Booking.checkOutDate,
					detailCheckIn: BookingRoomDetail.checkIn,
					detailCheckOut: BookingRoomDetail.checkOut,
					detailTotalPrice: BookingRoomDetail.totalPrice,
					detailVariantId: BookingRoomDetail.variantId,
					productId: Product.id,
					productName: Product.name,
					variantName: Variant.name,
				})
				.from(Booking)
				.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
				.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
				.leftJoin(Product, eq(Product.id, Variant.productId))
				.where(and(...filters))
				.orderBy(desc(Booking.bookingDate), desc(Booking.id))
				.all()

			const seen = new Set<string>()
			const items: ProviderBookingSummaryItem[] = []

			for (const row of rows) {
				if (seen.has(row.bookingId)) continue
				seen.add(row.bookingId)

				const currency = String(row.currency ?? "USD")
					.trim()
					.toUpperCase()
				const totalPrice =
					currency === "BOB"
						? Number(row.totalAmountBOB ?? row.detailTotalPrice ?? 0)
						: Number(row.totalAmountUSD ?? row.detailTotalPrice ?? 0)

				items.push({
					bookingId: row.bookingId,
					productId: row.productId ?? null,
					productName: row.productName ?? null,
					variantId: row.detailVariantId ?? null,
					variantName: row.variantName ?? null,
					checkIn: String(row.detailCheckIn ?? row.checkInDate ?? "").trim() || null,
					checkOut: String(row.detailCheckOut ?? row.checkOutDate ?? "").trim() || null,
					totalPrice,
					currency,
					status: String(row.status ?? "draft"),
					createdAt: toIso(row.bookingDate),
					confirmedAt: toIso(row.confirmedAt),
				})
			}

			return { items }
		}
	)
}
