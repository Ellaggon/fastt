import type { APIRoute } from "astro"
import {
	and,
	db,
	eq,
	GeoPlace,
	Product,
	ProductGeoPlace,
	ProductStatus,
} from "@/shared/infrastructure/db/compat"

const escapeXml = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export const GET: APIRoute = async ({ url }) => {
	const [discoveryRows, products] = await Promise.all([
		db
			.select({
				slug: GeoPlace.slug,
				productType: Product.productType,
				updatedAt: GeoPlace.updatedAt,
			})
			.from(GeoPlace)
			.innerJoin(ProductGeoPlace, eq(ProductGeoPlace.placeId, GeoPlace.id))
			.innerJoin(Product, eq(Product.id, ProductGeoPlace.productId))
			.innerJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
			.where(
				and(
					eq(GeoPlace.status, "active"),
					eq(ProductGeoPlace.role, "primary_discovery"),
					eq(ProductGeoPlace.isPrimary, true),
					eq(Product.dataClass, "production"),
					eq(ProductStatus.state, "published")
				)
			),
		db
			.select({ id: Product.id, productType: Product.productType, updatedAt: Product.lastUpdated })
			.from(Product)
			.innerJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
			.where(and(eq(Product.dataClass, "production"), eq(ProductStatus.state, "published"))),
	])
	const destinationUrls = new Map<string, Date | null>()
	for (const row of discoveryRows) {
		const type = String(row.productType ?? "").toLowerCase()
		const surface = type === "hotel" ? "alojamientos" : type === "tour" ? "tours" : null
		if (!surface) continue
		const path = `/destinos/${encodeURIComponent(row.slug)}/${surface}`
		const previous = destinationUrls.get(path)
		if (!previous || (row.updatedAt && row.updatedAt > previous)) {
			destinationUrls.set(path, row.updatedAt)
		}
	}

	const urls = [
		{ path: "/", updatedAt: null },
		{ path: "/hotels", updatedAt: null },
		{ path: "/tours", updatedAt: null },
		...[...destinationUrls].map(([path, updatedAt]) => ({ path, updatedAt })),
		...products.flatMap((product) => {
			const type = String(product.productType ?? "").toLowerCase()
			return type === "hotel" || type === "tour"
				? [
						{
							path: `/${type === "hotel" ? "hotels" : "tours"}/${encodeURIComponent(product.id)}`,
							updatedAt: product.updatedAt,
						},
					]
				: []
		}),
	]
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((entry) => `<url><loc>${escapeXml(new URL(entry.path, url.origin).href)}</loc>${entry.updatedAt ? `<lastmod>${new Date(entry.updatedAt).toISOString().slice(0, 10)}</lastmod>` : ""}</url>`).join("")}</urlset>`
	return new Response(body, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	})
}
