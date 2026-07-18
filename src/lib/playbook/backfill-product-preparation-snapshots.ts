import {
	and,
	db,
	eq,
	inArray,
	Product,
	ProductPreparationSnapshot,
	ProductStatus,
	sql,
} from "astro:db"
import {
	refreshProductPreparationSnapshot,
	type ProductPreparationSummary,
} from "@/lib/playbook/summarize-product-preparation"

type ProductRow = {
	id: string
	providerId: string | null
}

export type ProductPreparationSnapshotBackfillParams = {
	providerId?: string | null
	productId?: string | null
	limit?: number | null
}

export type ProductPreparationSnapshotBackfillResult = {
	ok: boolean
	candidates: number
	updated: number
	failed: number
	totalSnapshots: number
	readyToPublish: number
	blockerCount: number
	durationMs: number
	filters: {
		providerId: string | null
		productId: string | null
		limit: number | null
	}
	failures: Array<{ productId: string; error: string }>
}

function normalizeLimit(raw: number | null | undefined): number {
	const parsed = Number(raw)
	if (!Number.isFinite(parsed) || parsed <= 0) return Number.POSITIVE_INFINITY
	return Math.floor(parsed)
}

export async function backfillProductPreparationSnapshots(
	params: ProductPreparationSnapshotBackfillParams = {}
): Promise<ProductPreparationSnapshotBackfillResult> {
	const startedAt = performance.now()
	const filters = {
		productId: String(params.productId ?? "").trim(),
		providerId: String(params.providerId ?? "").trim(),
	}
	const limit = normalizeLimit(params.limit)
	const whereClause =
		filters.providerId && filters.productId
			? and(eq(Product.providerId, filters.providerId), eq(Product.id, filters.productId))
			: filters.providerId
				? eq(Product.providerId, filters.providerId)
				: filters.productId
					? eq(Product.id, filters.productId)
					: sql`1 = 1`
	const baseQuery = db
		.select({
			id: Product.id,
			providerId: Product.providerId,
		})
		.from(Product)
		.where(whereClause)
	const rows = Number.isFinite(limit) ? await baseQuery.limit(limit).all() : await baseQuery.all()

	const products = rows.filter((row) => Boolean(row.id && row.providerId)) as ProductRow[]
	const productIds = products.map((product) => product.id)
	const statuses = productIds.length
		? await db
				.select({ productId: ProductStatus.productId, state: ProductStatus.state })
				.from(ProductStatus)
				.where(inArray(ProductStatus.productId, productIds))
				.all()
		: []
	const statusByProduct = new Map(statuses.map((row) => [String(row.productId), row.state]))

	let updated = 0
	let failed = 0
	const failures: Array<{ productId: string; error: string }> = []
	const summaries: ProductPreparationSummary[] = []

	for (const product of products) {
		try {
			const summary = await refreshProductPreparationSnapshot({
				productId: product.id,
				providerId: String(product.providerId),
				status: statusByProduct.get(product.id),
			})
			if (summary) {
				updated += 1
				summaries.push(summary)
			}
		} catch (error) {
			failed += 1
			failures.push({
				productId: product.id,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	const totalSnapshots = await db
		.select({ count: sql<number>`count(*)` })
		.from(ProductPreparationSnapshot)
		.get()
	const durationMs = Number((performance.now() - startedAt).toFixed(1))

	return {
		ok: failed === 0,
		candidates: products.length,
		updated,
		failed,
		totalSnapshots: Number(totalSnapshots?.count ?? 0),
		readyToPublish: summaries.filter((summary) => summary.readyToPublish).length,
		blockerCount: summaries.reduce((sum, summary) => sum + summary.blockerCount, 0),
		durationMs,
		filters: {
			providerId: filters.providerId || null,
			productId: filters.productId || null,
			limit: Number.isFinite(limit) ? limit : null,
		},
		failures,
	}
}
