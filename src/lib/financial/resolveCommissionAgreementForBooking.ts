import {
	resolveBookingCommercialLineFromRows,
	resolveCommissionAgreement,
	type ResolvedCommissionAgreement,
} from "@/lib/financial/commissionAgreement"
import { snapshotProduct, variantProduct } from "@/lib/financial/providerFinanceLineAggregate"
import { listProviderCommercialLines } from "@/lib/verification/commercial-lines"
import { and, Booking, BookingLineItem, db, eq, Variant } from "@/shared/infrastructure/db/compat"

/**
 * DB-backed resolver for the commission write path: the booking line comes from the line item
 * product snapshot; the agreement only counts when the provider has enrolled that line.
 */
export async function resolveCommissionAgreementForBooking(input: {
	providerId: string
	bookingId: string
}): Promise<ResolvedCommissionAgreement> {
	const [rows, lines] = await Promise.all([
		db
			.select({
				productType: snapshotProduct.productType,
				productTypeFallback: variantProduct.productType,
			})
			.from(BookingLineItem)
			.innerJoin(Booking, eq(Booking.id, BookingLineItem.bookingId))
			.leftJoin(snapshotProduct, eq(snapshotProduct.id, BookingLineItem.productIdSnapshot))
			.leftJoin(Variant, eq(Variant.id, BookingLineItem.variantId))
			.leftJoin(variantProduct, eq(variantProduct.id, Variant.productId))
			.where(
				and(
					eq(BookingLineItem.bookingId, input.bookingId),
					eq(Booking.providerId, input.providerId)
				)
			),
		listProviderCommercialLines(input.providerId).catch(() => []),
	])
	return resolveCommissionAgreement({
		commercialLine: resolveBookingCommercialLineFromRows(rows),
		enrolledLines: lines.map((entry) => entry.line),
	})
}
