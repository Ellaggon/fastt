import { db, Destination, Product, and, eq, or, sql } from "astro:db"
import type {
	MarketplaceHotelCandidate,
	MarketplaceHotelSearchRepositoryPort,
} from "../../application/ports/MarketplaceHotelSearchRepositoryPort"

export class MarketplaceHotelSearchRepository implements MarketplaceHotelSearchRepositoryPort {
	async listHotelsByDestination(params: {
		destinationIdOrSlug: string
		limit: number
	}): Promise<MarketplaceHotelCandidate[]> {
		const destinationIdOrSlug = String(params.destinationIdOrSlug ?? "").trim()
		const limit = Math.min(Math.max(1, Number(params.limit ?? 50)), 200)
		if (!destinationIdOrSlug) return []

		// Accept either Destination.id or Destination.slug so UI can pass either safely.
		const dest = await db
			.select({ id: Destination.id })
			.from(Destination)
			.where(or(eq(Destination.id, destinationIdOrSlug), eq(Destination.slug, destinationIdOrSlug)))
			.get()
		if (!dest?.id) return []

		const rows = await db
			.select({
				productId: Product.id,
				name: Product.name,
				destinationId: Product.destinationId,
				heroImageUrl: sql<string>`(
					SELECT url
					FROM Image
					WHERE (entityType = 'Product' AND entityId = ${Product.id})
					   OR (
					      entityType = 'Variant'
					      AND entityId IN (
					         SELECT id FROM Variant WHERE productId = ${Product.id}
					      )
					   )
					ORDER BY isPrimary DESC, "order" ASC
					LIMIT 1
				)`.as("heroImageUrl"),
			})
			.from(Product)
			.where(and(eq(Product.productType, "Hotel"), eq(Product.destinationId, dest.id)))
			.limit(limit)
			.all()

		return rows.map((r) => ({
			productId: String(r.productId),
			name: String(r.name ?? ""),
			destinationId: String(r.destinationId ?? ""),
			heroImageUrl: r.heroImageUrl ? String(r.heroImageUrl) : null,
		}))
	}
}
