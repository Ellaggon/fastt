import type { SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

import {
	and,
	db,
	eq,
	FinancialExceptionRecord,
	FinancialProviderSummary,
	FinancialSettlementRecord,
	PaymentTransaction,
	RefundLedger,
	sql,
} from "@/shared/infrastructure/db/compat"

import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import type { FinancialApiProductFilter } from "@/lib/financial/financialApiProductScope"
import { bookingIdMatchesProductFilter } from "@/lib/financial/financialScopedBookingQuery"

type MoneySummary = {
	count: number
	amount: number
	currency: string | null
	lastAt: string | null
}

export type FinancialProviderSummarySurface = {
	providerId: string
	summary: {
		collections: MoneySummary & {
			captures: number
			refunds: number
			failed: number
		}
		refunds: MoneySummary & {
			recorded: number
			pending: number
			failed: number
		}
		exceptions: {
			total: number
			open: number
			acknowledged: number
			resolved: number
			dismissed: number
			lastOpenedAt: string | null
		}
		settlements: MoneySummary & {
			recorded: number
			unmatched: number
		}
	}
	freshness: {
		source: "FinancialProviderSummary" | "scoped_live_aggregate"
		cacheState: "hit" | "miss"
		computedAt: string
		stale: boolean
		invalidatedAt: string | null
		invalidationReason: string | null
	}
	readModel: {
		materialized: boolean
		detailStrategy: "tab_detail_on_demand"
		cacheTtlSeconds: number
		/** `provider` = whole account; `workspace_scope` = filtered to the active line/product. */
		scope: "provider" | "workspace_scope"
	}
}

function numberValue(value: unknown): number {
	const parsed = Number(value ?? 0)
	return Number.isFinite(parsed) ? parsed : 0
}

function moneyValue(value: unknown): number {
	return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100
}

function iso(value: unknown): string | null {
	if (!value) return null
	const parsed = value instanceof Date ? value : new Date(String(value))
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function firstCurrency(...values: unknown[]): string | null {
	for (const value of values) {
		const normalized = String(value ?? "")
			.trim()
			.toUpperCase()
		if (/^[A-Z]{3}$/.test(normalized)) return normalized
	}
	return null
}

function isMaterializedFresh(row: { computedAt: unknown; invalidatedAt?: unknown }): boolean {
	const computedAt = row.computedAt ? new Date(String(row.computedAt)) : null
	const invalidatedAt = row.invalidatedAt ? new Date(String(row.invalidatedAt)) : null
	if (!computedAt || Number.isNaN(computedAt.getTime())) return false
	if (!invalidatedAt || Number.isNaN(invalidatedAt.getTime())) return true
	return computedAt >= invalidatedAt
}

function surfaceFromRow(
	row: typeof FinancialProviderSummary.$inferSelect,
	cacheState: "hit" | "miss"
): FinancialProviderSummarySurface {
	const collections =
		row.collectionsJson as FinancialProviderSummarySurface["summary"]["collections"]
	const refunds = row.refundsJson as FinancialProviderSummarySurface["summary"]["refunds"]
	const exceptions = row.exceptionsJson as FinancialProviderSummarySurface["summary"]["exceptions"]
	const settlements =
		row.settlementsJson as FinancialProviderSummarySurface["summary"]["settlements"]
	return {
		providerId: row.providerId,
		summary: {
			collections,
			refunds,
			exceptions,
			settlements,
		},
		freshness: {
			source: "FinancialProviderSummary",
			cacheState,
			computedAt: iso(row.computedAt) ?? new Date().toISOString(),
			stale: !isMaterializedFresh(row),
			invalidatedAt: iso(row.invalidatedAt),
			invalidationReason: row.invalidationReason ?? null,
		},
		readModel: {
			materialized: true,
			detailStrategy: "tab_detail_on_demand",
			cacheTtlSeconds: cacheTtls.financialProviderSummary,
			scope: "provider",
		},
	}
}

function scopedPredicate(
	column: AnyPgColumn,
	providerPredicate: SQL,
	productFilter: FinancialApiProductFilter
): SQL {
	const predicate = bookingIdMatchesProductFilter(column, productFilter)
	return predicate ? and(providerPredicate, predicate)! : providerPredicate
}

async function computeFinancialProviderSummary(
	providerId: string,
	productFilter: FinancialApiProductFilter = null
): Promise<{
	collections: FinancialProviderSummarySurface["summary"]["collections"]
	refunds: FinancialProviderSummarySurface["summary"]["refunds"]
	exceptions: FinancialProviderSummarySurface["summary"]["exceptions"]
	settlements: FinancialProviderSummarySurface["summary"]["settlements"]
}> {
	const [collectionsRow, refundsRow, exceptionsRow, settlementsRow] = await Promise.all([
		db
			.select({
				count: sql<number>`count(*)`,
				amount: sql<number>`coalesce(sum(${PaymentTransaction.amount}), 0)`,
				captures: sql<number>`coalesce(sum(case when ${PaymentTransaction.type} = 'capture' then 1 else 0 end), 0)`,
				refunds: sql<number>`coalesce(sum(case when ${PaymentTransaction.type} = 'refund' then 1 else 0 end), 0)`,
				failed: sql<number>`coalesce(sum(case when ${PaymentTransaction.status} = 'failed' then 1 else 0 end), 0)`,
				currency: sql<string | null>`max(${PaymentTransaction.currency})`,
				lastAt: sql<Date | null>`max(${PaymentTransaction.occurredAt})`,
			})
			.from(PaymentTransaction)
			.where(
				scopedPredicate(
					PaymentTransaction.bookingId,
					eq(PaymentTransaction.providerId, providerId),
					productFilter
				)
			)
			.then((rows) => rows[0]),
		db
			.select({
				count: sql<number>`count(*)`,
				amount: sql<number>`coalesce(sum(${RefundLedger.refundAmount}), 0)`,
				recorded: sql<number>`coalesce(sum(case when ${RefundLedger.status} in ('recorded', 'applied') then 1 else 0 end), 0)`,
				pending: sql<number>`coalesce(sum(case when ${RefundLedger.status} in ('pending', 'created') then 1 else 0 end), 0)`,
				failed: sql<number>`coalesce(sum(case when ${RefundLedger.status} = 'failed' then 1 else 0 end), 0)`,
				currency: sql<string | null>`max(${RefundLedger.currency})`,
				lastAt: sql<Date | null>`max(${RefundLedger.appliedAt})`,
			})
			.from(RefundLedger)
			.where(
				scopedPredicate(
					RefundLedger.bookingId,
					eq(RefundLedger.providerId, providerId),
					productFilter
				)
			)
			.then((rows) => rows[0]),
		db
			.select({
				total: sql<number>`count(*)`,
				open: sql<number>`coalesce(sum(case when ${FinancialExceptionRecord.status} = 'open' then 1 else 0 end), 0)`,
				acknowledged: sql<number>`coalesce(sum(case when ${FinancialExceptionRecord.status} = 'acknowledged' then 1 else 0 end), 0)`,
				resolved: sql<number>`coalesce(sum(case when ${FinancialExceptionRecord.status} = 'resolved' then 1 else 0 end), 0)`,
				dismissed: sql<number>`coalesce(sum(case when ${FinancialExceptionRecord.status} = 'dismissed' then 1 else 0 end), 0)`,
				lastOpenedAt: sql<Date | null>`max(${FinancialExceptionRecord.openedAt})`,
			})
			.from(FinancialExceptionRecord)
			.where(
				scopedPredicate(
					FinancialExceptionRecord.bookingId,
					eq(FinancialExceptionRecord.providerId, providerId),
					productFilter
				)
			)
			.then((rows) => rows[0]),
		db
			.select({
				count: sql<number>`count(*)`,
				amount: sql<number>`coalesce(sum(${FinancialSettlementRecord.amount}), 0)`,
				recorded: sql<number>`coalesce(sum(case when ${FinancialSettlementRecord.bookingId} is not null then 1 else 0 end), 0)`,
				unmatched: sql<number>`coalesce(sum(case when ${FinancialSettlementRecord.bookingId} is null then 1 else 0 end), 0)`,
				currency: sql<string | null>`max(${FinancialSettlementRecord.currency})`,
				lastAt: sql<Date | null>`max(${FinancialSettlementRecord.settlementDate})`,
			})
			.from(FinancialSettlementRecord)
			.where(
				scopedPredicate(
					FinancialSettlementRecord.bookingId,
					eq(FinancialSettlementRecord.providerId, providerId),
					productFilter
				)
			)
			.then((rows) => rows[0]),
	])

	const currency = firstCurrency(
		collectionsRow?.currency,
		refundsRow?.currency,
		settlementsRow?.currency
	)
	return {
		collections: {
			count: numberValue(collectionsRow?.count),
			amount: moneyValue(collectionsRow?.amount),
			currency,
			lastAt: iso(collectionsRow?.lastAt),
			captures: numberValue(collectionsRow?.captures),
			refunds: numberValue(collectionsRow?.refunds),
			failed: numberValue(collectionsRow?.failed),
		},
		refunds: {
			count: numberValue(refundsRow?.count),
			amount: moneyValue(refundsRow?.amount),
			currency,
			lastAt: iso(refundsRow?.lastAt),
			recorded: numberValue(refundsRow?.recorded),
			pending: numberValue(refundsRow?.pending),
			failed: numberValue(refundsRow?.failed),
		},
		exceptions: {
			total: numberValue(exceptionsRow?.total),
			open: numberValue(exceptionsRow?.open),
			acknowledged: numberValue(exceptionsRow?.acknowledged),
			resolved: numberValue(exceptionsRow?.resolved),
			dismissed: numberValue(exceptionsRow?.dismissed),
			lastOpenedAt: iso(exceptionsRow?.lastOpenedAt),
		},
		settlements: {
			count: numberValue(settlementsRow?.count),
			amount: moneyValue(settlementsRow?.amount),
			currency,
			lastAt: iso(settlementsRow?.lastAt),
			recorded: numberValue(settlementsRow?.recorded),
			unmatched: numberValue(settlementsRow?.unmatched),
		},
	}
}

export async function refreshFinancialProviderSummary(params: {
	providerId: string
	reason?: string | null
}): Promise<FinancialProviderSummarySurface> {
	const providerId = String(params.providerId ?? "").trim()
	if (!providerId) throw new Error("providerId_required")
	const computed = await computeFinancialProviderSummary(providerId)
	const now = new Date()
	const values = {
		providerId,
		summaryJson: {
			collections: computed.collections,
			refunds: computed.refunds,
			exceptions: computed.exceptions,
			settlements: computed.settlements,
		},
		collectionsJson: computed.collections,
		refundsJson: computed.refunds,
		exceptionsJson: computed.exceptions,
		settlementsJson: computed.settlements,
		computedAt: now,
		invalidatedAt: null,
		invalidationReason: params.reason ?? null,
		updatedAt: now,
	}
	const [row] = await db
		.insert(FinancialProviderSummary)
		.values({ ...values, createdAt: now })
		.onConflictDoUpdate({
			target: FinancialProviderSummary.providerId,
			set: values,
		})
		.returning()
	const surface = surfaceFromRow(row, "miss")
	await persistentCache.set(
		cacheKeys.financialProviderSummary(providerId),
		surface,
		cacheTtls.financialProviderSummary
	)
	return surface
}

/**
 * Scoped summaries are not materialized: they are computed live with the workspace product
 * filter and cached under a scope-specific key, so the provider-wide row never leaks into a line.
 */
async function getScopedFinancialProviderSummary(
	providerId: string,
	productFilter: string[]
): Promise<FinancialProviderSummarySurface> {
	const key = cacheKeys.financialProviderSummaryScoped(providerId, productFilter)
	const cached = await persistentCache.get(key)
	if (cached && typeof cached === "object") {
		const surface = cached as FinancialProviderSummarySurface
		return { ...surface, freshness: { ...surface.freshness, cacheState: "hit" } }
	}
	const computed = await computeFinancialProviderSummary(providerId, productFilter)
	const surface: FinancialProviderSummarySurface = {
		providerId,
		summary: computed,
		freshness: {
			source: "scoped_live_aggregate",
			cacheState: "miss",
			computedAt: new Date().toISOString(),
			stale: false,
			invalidatedAt: null,
			invalidationReason: null,
		},
		readModel: {
			materialized: false,
			detailStrategy: "tab_detail_on_demand",
			cacheTtlSeconds: cacheTtls.financialProviderSummary,
			scope: "workspace_scope",
		},
	}
	await persistentCache.set(key, surface, cacheTtls.financialProviderSummary)
	return surface
}

export async function getFinancialProviderSummary(params: {
	providerId: string
	productFilter?: FinancialApiProductFilter
}): Promise<FinancialProviderSummarySurface> {
	const providerId = String(params.providerId ?? "").trim()
	if (!providerId) throw new Error("providerId_required")
	if (params.productFilter !== undefined && params.productFilter !== null) {
		return getScopedFinancialProviderSummary(providerId, params.productFilter)
	}
	const key = cacheKeys.financialProviderSummary(providerId)
	const cached = await persistentCache.get(key)
	if (cached && typeof cached === "object") {
		const surface = cached as FinancialProviderSummarySurface
		return {
			...surface,
			freshness: { ...surface.freshness, cacheState: "hit" },
		}
	}
	const row = await db
		.select()
		.from(FinancialProviderSummary)
		.where(eq(FinancialProviderSummary.providerId, providerId))
		.then((rows) => rows[0])
	if (row && isMaterializedFresh(row)) {
		const surface = surfaceFromRow(row, "miss")
		await persistentCache.set(key, surface, cacheTtls.financialProviderSummary)
		return surface
	}
	return await refreshFinancialProviderSummary({
		providerId,
		reason: "summary_cache_miss_or_stale",
	})
}

export async function invalidateFinancialProviderSummary(params: {
	providerId: string
	reason: string
	refresh?: boolean
}): Promise<void> {
	const providerId = String(params.providerId ?? "").trim()
	if (!providerId) return
	await persistentCache.delByPrefix(cacheKeys.financialProviderSummaryPrefix(providerId))
	const now = new Date()
	await db
		.insert(FinancialProviderSummary)
		.values({
			providerId,
			summaryJson: {},
			collectionsJson: {},
			refundsJson: {},
			exceptionsJson: {},
			settlementsJson: {},
			computedAt: new Date(0),
			invalidatedAt: now,
			invalidationReason: params.reason,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: FinancialProviderSummary.providerId,
			set: {
				invalidatedAt: now,
				invalidationReason: params.reason,
				updatedAt: now,
			},
		})
	if (params.refresh) {
		void refreshFinancialProviderSummary({ providerId, reason: params.reason }).catch(() => {})
	}
}
