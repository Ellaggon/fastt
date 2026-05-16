import type { APIRoute } from "astro"
import {
	and,
	Booking,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	desc,
	eq,
	inArray,
	Product,
	sql,
	Variant,
} from "astro:db"

import {
	commissionSnapshotRepository,
	financialSettlementRecordRepository,
	payoutRecordRepository,
	providerFinancialProfileRepository,
	providerPayableSnapshotRepository,
	providerStatementRepository,
	reconciliationMatchRepository,
} from "@/container/financial.container"
import { buildProviderFinanceSummary } from "@/modules/financial/public"

import { json, requireFinancialProvider } from "./_stage2"

export const GET: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response

	const bookingRows = await db
		.select({
			bookingId: Booking.id,
			status: Booking.status,
			currency: Booking.currency,
			confirmedAt: Booking.confirmedAt,
			detailId: BookingRoomDetail.id,
			detailTotalPrice: BookingRoomDetail.totalPrice,
			detailTaxes: BookingRoomDetail.taxes,
			providerIdSnapshot: BookingRoomDetail.providerIdSnapshot,
			productNameSnapshot: BookingRoomDetail.productNameSnapshot,
			variantNameSnapshot: BookingRoomDetail.variantNameSnapshot,
			productName: Product.name,
			variantName: Variant.name,
		})
		.from(Booking)
		.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
		.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
		.leftJoin(Product, eq(Product.id, Variant.productId))
		.where(
			and(
				sql`(${Product.providerId} = ${auth.providerId} OR ${BookingRoomDetail.providerIdSnapshot} = ${auth.providerId})`
			)
		)
		.orderBy(desc(Booking.confirmedAt), desc(Booking.id))
		.all()
	const bookingIds = [...new Set(bookingRows.map((row) => String(row.bookingId)).filter(Boolean))]

	const taxRows = bookingIds.length
		? await db
				.select({
					bookingId: BookingTaxFee.bookingId,
					totalAmount: BookingTaxFee.totalAmount,
				})
				.from(BookingTaxFee)
				.where(inArray(BookingTaxFee.bookingId, bookingIds))
				.all()
		: []

	const [
		profile,
		commissionSnapshots,
		payableSnapshots,
		payoutRecords,
		statements,
		reconciliationMatches,
		settlementRecords,
	] = await Promise.all([
		providerFinancialProfileRepository.findByProviderId(auth.providerId),
		commissionSnapshotRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		providerPayableSnapshotRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		payoutRecordRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		providerStatementRepository.findByProvider({ providerId: auth.providerId, limit: 1000 }),
		reconciliationMatchRepository.findByProvider({ providerId: auth.providerId, limit: 1000 }),
		financialSettlementRecordRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
	])

	const summary = buildProviderFinanceSummary({
		providerId: auth.providerId,
		bookingRows,
		taxRows,
		profile,
		commissionSnapshots,
		payableSnapshots,
		payoutRecords,
		statements,
		reconciliationMatches,
		settlementRecords,
	})

	return json({
		...summary,
		readOnly: true,
		sourceOfTruth: {
			contractGrossAmount: "BookingRoomDetail snapshot aggregation",
			commissionBasis: "CommissionSnapshot",
			settlementEvidence: "FinancialSettlementRecord",
			payableVisibility: "ProviderPayableSnapshot",
			payoutEligibility: "ProviderPayableSnapshot + ReconciliationMatch + ProviderFinancialProfile",
			providerStatementAggregation: "ProviderStatement",
			compatibilityOnlyExcluded: true,
		},
	})
}
