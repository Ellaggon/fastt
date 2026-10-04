import {
	and,
	asc,
	db,
	desc,
	eq,
	Product,
	sql,
	TourPrivateRequest,
	Variant,
} from "@/shared/infrastructure/db/compat"

export const privateRequestStatuses = [
	"pending",
	"accepted",
	"declined",
	"expired",
	"cancelled",
] as const
export type PrivateRequestStatus = (typeof privateRequestStatuses)[number]
export type PrivateRequestFilters = {
	productId?: string
	status: PrivateRequestStatus | "all"
	page: number
	pageSize: number
}

/** Provider-owned aggregate: filtering and totals precede pagination. */
export async function listTourPrivateRequests(providerId: string, filters: PrivateRequestFilters) {
	const owned = and(
		eq(TourPrivateRequest.providerId, providerId),
		eq(Product.providerId, providerId),
		sql`lower(${Product.productType}) = 'tour'`
	)
	const filtered = and(
		owned,
		filters.productId ? eq(TourPrivateRequest.productId, filters.productId) : undefined,
		filters.status === "all" ? undefined : eq(TourPrivateRequest.status, filters.status)
	)
	const count = async (where: typeof filtered) => {
		const [row] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(TourPrivateRequest)
			.innerJoin(Product, eq(Product.id, TourPrivateRequest.productId))
			.where(where)
		return Number(row?.total ?? 0)
	}
	const [total, pendingCount] = await Promise.all([
		count(filtered),
		count(and(owned, eq(TourPrivateRequest.status, "pending"))),
	])
	const pageCount = Math.max(1, Math.ceil(total / filters.pageSize))
	const page = Math.min(filters.page, pageCount)
	const items = await db
		.select({ request: TourPrivateRequest, productName: Product.name, variantName: Variant.name })
		.from(TourPrivateRequest)
		.innerJoin(Product, eq(Product.id, TourPrivateRequest.productId))
		.leftJoin(
			Variant,
			and(
				eq(Variant.id, TourPrivateRequest.variantId),
				eq(Variant.productId, TourPrivateRequest.productId)
			)
		)
		.where(filtered)
		.orderBy(
			sql`case when ${TourPrivateRequest.status} = 'pending' then 0 else 1 end`,
			sql`case when ${TourPrivateRequest.status} = 'pending' then ${TourPrivateRequest.slaDueAt} end asc nulls last`,
			sql`case when ${TourPrivateRequest.status} = 'pending' then ${TourPrivateRequest.createdAt} end asc`,
			desc(TourPrivateRequest.createdAt),
			asc(TourPrivateRequest.id)
		)
		.limit(filters.pageSize)
		.offset((page - 1) * filters.pageSize)
	return { items, total, pendingCount, page, pageCount }
}

export async function findTourPrivateRequest(providerId: string, requestId: string) {
	const [row] = await db
		.select({ request: TourPrivateRequest, productName: Product.name, variantName: Variant.name })
		.from(TourPrivateRequest)
		.innerJoin(Product, eq(Product.id, TourPrivateRequest.productId))
		.leftJoin(
			Variant,
			and(
				eq(Variant.id, TourPrivateRequest.variantId),
				eq(Variant.productId, TourPrivateRequest.productId)
			)
		)
		.where(
			and(
				eq(TourPrivateRequest.id, requestId),
				eq(TourPrivateRequest.providerId, providerId),
				eq(Product.providerId, providerId),
				sql`lower(${Product.productType}) = 'tour'`
			)
		)
	return row ? row : (null as null)
}

export async function countPendingTourPrivateRequests(providerId: string, productId?: string) {
	const filters = [
		eq(TourPrivateRequest.providerId, providerId),
		eq(Product.providerId, providerId),
		sql`lower(${Product.productType}) = 'tour'`,
		eq(TourPrivateRequest.status, "pending"),
	]
	if (productId) filters.push(eq(TourPrivateRequest.productId, productId))
	const [row] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(TourPrivateRequest)
		.innerJoin(Product, eq(Product.id, TourPrivateRequest.productId))
		.where(and(...filters))
	return Number(row?.total ?? 0)
}
