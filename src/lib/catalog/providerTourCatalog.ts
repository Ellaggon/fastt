import { and, db, desc, eq, Product, sql } from "@/shared/infrastructure/db/compat"

export type TourCatalogFilters = {
	query: string
	state: "all" | "draft" | "published"
	page: number
}
export const TOUR_CATALOG_PAGE_SIZE = 20

export function tourCatalogFilters(params: URLSearchParams): TourCatalogFilters {
	const state = params.get("state")
	const page = Number(params.get("page") ?? 1)
	return {
		query: (params.get("q") ?? "").trim().slice(0, 120),
		state: state === "draft" || state === "published" ? state : "all",
		page: Number.isSafeInteger(page) && page > 0 ? page : 1,
	}
}

export function tourCatalogHref(filters: TourCatalogFilters): string {
	const params = new URLSearchParams()
	if (filters.query) params.set("q", filters.query)
	if (filters.state !== "all") params.set("state", filters.state)
	if (filters.page > 1) params.set("page", String(filters.page))
	return `/catalog/tours${params.size ? `?${params}` : ""}`
}

/** Editorial totals deliberately do not interpret stored `ready` as commercial readiness. */
export async function countProviderTours(providerId: string, query = "") {
	const [row] = await db
		.select({
			total: sql<number>`count(*)::int`,
			published: sql<number>`count(*) filter (where ${Product.publicationState} = 'published')::int`,
		})
		.from(Product)
		.where(
			and(
				eq(Product.providerId, providerId),
				sql`lower(${Product.productType}) = 'tour'`,
				query ? sql`position(lower(${query}) in lower(${Product.name})) > 0` : undefined
			)
		)
	const total = Number(row?.total ?? 0)
	const published = Number(row?.published ?? 0)
	return { total, published, draft: total - published }
}

/** Ownership, filtering and pagination precede commercial evaluation. One row is one tour. */
export async function listProviderTourCatalog(providerId: string, filters: TourCatalogFilters) {
	const counts = await countProviderTours(providerId, filters.query)
	const filteredTotal = filters.state === "all" ? counts.total : counts[filters.state]
	const pageCount = Math.max(1, Math.ceil(filteredTotal / TOUR_CATALOG_PAGE_SIZE))
	const page = Math.min(filters.page, pageCount)
	const products = await db
		.select({
			id: Product.id,
			name: Product.name,
			publicationState: Product.publicationState,
			optionCount: sql<number>`(select count(*)::int from "Variant" option where option."productId" = "Product"."id" and option."lifecycleState" <> 'archived')`,
			imageUrl: sql<
				string | null
			>`(select image."url" from "ProductImage" link join "Image" image on image."id" = link."imageId" where link."productId" = "Product"."id" order by link."isPrimary" desc, link."sortOrder", link."imageId" limit 1)`,
			destinationName: sql<
				string | null
			>`(select place."canonicalName" from "ProductGeoPlace" link join "GeoPlace" place on place."id" = link."placeId" where link."productId" = "Product"."id" and link."role" = 'primary_discovery' order by link."isPrimary" desc, link."id" limit 1)`,
		})
		.from(Product)
		.where(
			and(
				eq(Product.providerId, providerId),
				sql`lower(${Product.productType}) = 'tour'`,
				filters.query
					? sql`position(lower(${filters.query}) in lower(${Product.name})) > 0`
					: undefined,
				filters.state === "published"
					? eq(Product.publicationState, "published")
					: filters.state === "draft"
						? sql`${Product.publicationState} <> 'published'`
						: undefined
			)
		)
		.orderBy(desc(Product.lastUpdated), desc(Product.id))
		.limit(TOUR_CATALOG_PAGE_SIZE)
		.offset((page - 1) * TOUR_CATALOG_PAGE_SIZE)
	return { products, counts, filteredTotal, page, pageCount }
}
