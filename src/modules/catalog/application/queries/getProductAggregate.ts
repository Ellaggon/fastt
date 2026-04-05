import {
	and,
	asc,
	db,
	eq,
	Image,
	Product,
	ProductContent,
	ProductLocation,
	ProductStatus,
} from "astro:db"

type ProductAggregate = {
	id: string
	displayName: string
	status: string
	content: {
		description: string | null
		highlights: unknown
		rules: string | null
	}
	location: {
		address: string | null
		lat: number | null
		lng: number | null
	}
	images: Array<{
		id: string
		url: string
		isPrimary: boolean
		order: number
	}>
}

export async function getProductAggregate(productId: string): Promise<ProductAggregate | null> {
	if (!productId) return null

	// INVARIANT:
	// Product is identity only.
	// Content fields must be resolved from ProductContent.
	// Business logic must not depend on Product-only mutable content.
	const rows = await db
		.select({
			id: Product.id,
			displayName: Product.name,
			contentDescription: ProductContent.description,
			status: ProductStatus.state,
			contentRules: ProductContent.rules,
			contentHighlights: ProductContent.highlightsJson,
			address: ProductLocation.address,
			lat: ProductLocation.lat,
			lng: ProductLocation.lng,
		})
		.from(Product)
		.leftJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
		.leftJoin(ProductContent, eq(ProductContent.productId, Product.id))
		.leftJoin(ProductLocation, eq(ProductLocation.productId, Product.id))
		.where(eq(Product.id, productId))
		.limit(1)
		.all()

	const row = rows[0]
	if (!row) return null

	const images = await db
		.select({
			id: Image.id,
			url: Image.url,
			isPrimary: Image.isPrimary,
			order: Image.order,
		})
		.from(Image)
		.where(and(eq(Image.entityId, productId), eq(Image.entityType, "Product")))
		.orderBy(asc(Image.order))
		.all()

	const modernDescription = row.contentDescription ? String(row.contentDescription).trim() : null
	const description: string | null = modernDescription || null

	return {
		id: row.id,
		displayName: row.displayName,
		status: row.status || "draft",
		content: {
			description,
			highlights: row.contentHighlights ?? [],
			rules: row.contentRules ? String(row.contentRules) : null,
		},
		location: {
			address: row.address ?? null,
			lat: row.lat ?? null,
			lng: row.lng ?? null,
		},
		images: images.map((image) => ({
			id: image.id,
			url: image.url,
			isPrimary: Boolean(image.isPrimary),
			order: Number(image.order ?? 0),
		})),
	}
}
