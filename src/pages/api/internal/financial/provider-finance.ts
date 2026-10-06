import type { APIRoute } from "astro"
import {
	and,
	Booking,
	BookingLineItem,
	BookingTaxFee,
	db,
	desc,
	eq,
	inArray,
	Variant,
} from "@/shared/infrastructure/db/compat"

import {
	commissionSnapshotRepository,
	financialSettlementRecordRepository,
	payoutRecordRepository,
	providerFinancialProfileRepository,
	providerPayableSnapshotRepository,
	providerStatementRepository,
	reconciliationMatchRepository,
} from "@/container/financial.container"
import { resolveFinancialApiProductScope } from "@/lib/financial/financialApiProductScope"
import {
	listScopedProviderBookingIdPage,
	parseFinancialBookingCursor,
} from "@/lib/financial/financialScopedBookingQuery"
import {
	loadScopedProviderFinanceLineSummary,
	snapshotProduct,
	variantProduct,
} from "@/lib/financial/providerFinanceLineAggregate"
import { assertProviderCapability } from "@/lib/provider-governance"
import { buildProviderFinanceSummary } from "@/modules/financial/public"

import { json, requireFinancialProvider } from "./_stage2"

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	try {
		await assertProviderCapability({
			providerId: auth.providerId,
			currentUserId: auth.user?.id ?? null,
			capability: "payments",
		})
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("PROVIDER_CONFIGURATION_BLOCKED")) {
			return json(
				{
					error: "provider_configuration_blocked",
					...(error as any).details,
				},
				423
			)
		}
		throw error
	}
	const scopeResult = await resolveFinancialApiProductScope(auth.providerId, url)
	if (!scopeResult.ok) return scopeResult.response

	const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 100))
	const cursor = parseFinancialBookingCursor(url.searchParams.get("cursor"))
	const bookingPage = await listScopedProviderBookingIdPage({
		providerId: auth.providerId,
		productFilter: scopeResult.productFilter,
		cursor,
		limit,
	})
	const pagedBookingIds = bookingPage.rows.map((row) => row.bookingId)
	if (!pagedBookingIds.length) {
		return json({
			items: [],
			summary: {
				totalBookings: 0,
				totalGrossAmount: 0,
				totalNetPayable: 0,
				totalCommission: 0,
				blockedCount: 0,
				readyCount: 0,
				byCommercialLine: [],
				byCommercialLineBasis: "full_scope",
			},
			pagination: { limit, returned: 0, hasMore: false, nextCursor: null },
			readOnly: true,
			sourceOfTruth: {
				contractGrossAmount: "BookingLineItem snapshot aggregation",
				commissionBasis: "CommissionSnapshot",
				settlementEvidence: "FinancialSettlementRecord",
				payableVisibility: "ProviderPayableSnapshot",
				payoutEligibility:
					"ProviderPayableSnapshot + ReconciliationMatch + ProviderFinancialProfile",
				providerStatementAggregation: "ProviderStatement",
				compatibilityOnlyExcluded: true,
			},
		})
	}

	const bookingRows = await db
		.select({
			bookingId: Booking.id,
			status: Booking.status,
			currency: Booking.currency,
			confirmedAt: Booking.confirmedAt,
			detailId: BookingLineItem.id,
			detailTotalAmount: BookingLineItem.totalAmount,
			detailTaxAmount: BookingLineItem.taxAmount,
			providerIdSnapshot: BookingLineItem.providerIdSnapshot,
			productIdSnapshot: BookingLineItem.productIdSnapshot,
			productId: snapshotProduct.id,
			productNameSnapshot: BookingLineItem.productNameSnapshot,
			variantNameSnapshot: BookingLineItem.variantNameSnapshot,
			productName: snapshotProduct.name,
			productType: snapshotProduct.productType,
			productTypeFallback: variantProduct.productType,
			variantName: Variant.name,
		})
		.from(Booking)
		.leftJoin(BookingLineItem, eq(BookingLineItem.bookingId, Booking.id))
		.leftJoin(snapshotProduct, eq(snapshotProduct.id, BookingLineItem.productIdSnapshot))
		.leftJoin(Variant, eq(Variant.id, BookingLineItem.variantId))
		.leftJoin(variantProduct, eq(variantProduct.id, Variant.productId))
		.where(and(eq(Booking.providerId, auth.providerId), inArray(Booking.id, pagedBookingIds)))
		.orderBy(desc(Booking.confirmedAt), desc(Booking.id))

	const bookingIds = [...new Set(bookingRows.map((row) => String(row.bookingId)).filter(Boolean))]

	const taxRows = bookingIds.length
		? await db
				.select({
					bookingId: BookingTaxFee.bookingId,
					totalAmount: BookingTaxFee.totalAmount,
				})
				.from(BookingTaxFee)
				.where(inArray(BookingTaxFee.bookingId, bookingIds))
		: []

	const [
		profile,
		scopeCommissionSnapshots,
		scopePayableSnapshots,
		payoutRecords,
		statements,
		reconciliationMatches,
		settlementRecords,
	] = await Promise.all([
		providerFinancialProfileRepository.findByProviderId(auth.providerId),
		// Provider-wide snapshots: the page uses its subset, the line aggregate needs the full scope.
		commissionSnapshotRepository.findByProvider({ providerId: auth.providerId, limit: 1000 }),
		providerPayableSnapshotRepository.findByProvider({ providerId: auth.providerId, limit: 1000 }),
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

	const pagedBookingIdSet = new Set(bookingIds)
	const commissionSnapshots = scopeCommissionSnapshots.filter((row) =>
		pagedBookingIdSet.has(row.bookingId)
	)
	const payableSnapshots = scopePayableSnapshots.filter((row) =>
		pagedBookingIdSet.has(row.bookingId)
	)
	const scopeLineSummary = await loadScopedProviderFinanceLineSummary({
		providerId: auth.providerId,
		productFilter: scopeResult.productFilter,
		commissionSnapshots: scopeCommissionSnapshots,
		payableSnapshots: scopePayableSnapshots,
	})

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
		scopeLineSummary,
	})

	return json({
		...summary,
		pagination: {
			limit,
			returned: Array.isArray(summary.items) ? summary.items.length : 0,
			hasMore: bookingPage.hasMore,
			nextCursor: bookingPage.nextCursor,
		},
		readOnly: true,
		sourceOfTruth: {
			contractGrossAmount: "BookingLineItem snapshot aggregation",
			commissionBasis: "CommissionSnapshot",
			settlementEvidence: "FinancialSettlementRecord",
			payableVisibility: "ProviderPayableSnapshot",
			payoutEligibility: "ProviderPayableSnapshot + ReconciliationMatch + ProviderFinancialProfile",
			providerStatementAggregation: "ProviderStatement",
			compatibilityOnlyExcluded: true,
		},
	})
}
