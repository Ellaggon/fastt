import { alias } from "drizzle-orm/pg-core"

import type { FinancialApiProductFilter } from "@/lib/financial/financialApiProductScope"
import {
	bookingMatchesProductFilterPredicate,
	type FinancialScopedDatabase,
} from "@/lib/financial/financialScopedBookingQuery"
import {
	and,
	Booking,
	BookingLineItem,
	db,
	eq,
	Product,
	sql,
	Variant,
} from "@/shared/infrastructure/db/compat"
import {
	aggregateProviderFinanceByCommercialLine,
	type CommissionSnapshot,
	type ProviderFinanceLineSummary,
	type ProviderPayableSnapshot,
} from "@/modules/financial/public"

/** Live product referenced by the immutable line item snapshot (primary line source). */
export const snapshotProduct = alias(Product, "snapshot_product")
/** Product reached through the live variant; only a fallback when the snapshot join is empty. */
export const variantProduct = alias(Product, "variant_product")

/**
 * Scope-wide gross per booking with the data needed to resolve its commercial line. Applies the
 * workspace product filter but no cursor or limit, so callers can present a true scope total.
 */
export async function listScopedProviderFinanceLineRows(input: {
	providerId: string
	productFilter: FinancialApiProductFilter
	database?: FinancialScopedDatabase
}) {
	const database = input.database ?? db
	if (input.productFilter !== null && input.productFilter.length === 0) return []
	const predicates = [eq(Booking.providerId, input.providerId)]
	const productPredicate = bookingMatchesProductFilterPredicate(input.productFilter, database)
	if (productPredicate) predicates.push(productPredicate)

	const rows = await database
		.select({
			bookingId: Booking.id,
			productType: snapshotProduct.productType,
			productTypeFallback: variantProduct.productType,
			grossAmount: sql<string>`coalesce(sum(${BookingLineItem.totalAmount}), 0)`,
		})
		.from(Booking)
		.leftJoin(BookingLineItem, eq(BookingLineItem.bookingId, Booking.id))
		.leftJoin(snapshotProduct, eq(snapshotProduct.id, BookingLineItem.productIdSnapshot))
		.leftJoin(Variant, eq(Variant.id, BookingLineItem.variantId))
		.leftJoin(variantProduct, eq(variantProduct.id, Variant.productId))
		.where(and(...predicates))
		.groupBy(Booking.id, snapshotProduct.productType, variantProduct.productType)

	return rows.map((row) => ({
		bookingId: String(row.bookingId),
		productType: row.productType,
		productTypeFallback: row.productTypeFallback,
		grossAmount: Number(row.grossAmount ?? 0),
	}))
}

export async function loadScopedProviderFinanceLineSummary(input: {
	providerId: string
	productFilter: FinancialApiProductFilter
	commissionSnapshots: readonly Pick<CommissionSnapshot, "bookingId" | "commissionAmount">[]
	payableSnapshots: readonly Pick<ProviderPayableSnapshot, "bookingId" | "netPayable">[]
	database?: FinancialScopedDatabase
}): Promise<ProviderFinanceLineSummary[]> {
	const rows = await listScopedProviderFinanceLineRows(input)
	return aggregateProviderFinanceByCommercialLine({
		rows,
		commissionSnapshots: input.commissionSnapshots,
		payableSnapshots: input.payableSnapshots,
	})
}
