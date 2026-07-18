import type { APIRoute } from "astro"
import { and, db, eq, inArray, Product, ProductStatus } from "astro:db"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { refreshProductPreparationSnapshot } from "@/lib/playbook/summarize-product-preparation"

export const POST: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const user = await getUserFromRequest(request)
	if (!user?.email) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) {
		return new Response(JSON.stringify({ error: "Provider not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const body = (await request.json().catch(() => ({}))) as { productIds?: unknown }
	const requestedIds = Array.isArray(body.productIds)
		? body.productIds.map((id) => String(id ?? "").trim()).filter(Boolean)
		: []
	const productIds = Array.from(new Set(requestedIds)).slice(0, 12)
	if (productIds.length === 0) {
		return new Response(JSON.stringify({ products: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}

	const ownedProducts = await db
		.select({ id: Product.id })
		.from(Product)
		.where(and(eq(Product.providerId, providerId), inArray(Product.id, productIds)))

	const ownedProductIds = ownedProducts.map((product) => String(product.id))
	const statuses = ownedProductIds.length
		? await db
				.select({ productId: ProductStatus.productId, state: ProductStatus.state })
				.from(ProductStatus)
				.where(inArray(ProductStatus.productId, ownedProductIds))
		: []
	const statusMap = new Map(
		statuses.map((row) => [
			String(row.productId),
			String(row.state ?? "")
				.trim()
				.toLowerCase(),
		])
	)

	const products = await Promise.all(
		ownedProductIds.map((productId) =>
			refreshProductPreparationSnapshot({
				productId,
				providerId,
				status: statusMap.get(productId),
				request,
				url,
			})
		)
	)

	const durationMs = Number((performance.now() - startedAt).toFixed(1))
	return new Response(JSON.stringify({ products: products.filter(Boolean), durationMs }), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Server-Timing": `product-preparation-refresh;dur=${durationMs}`,
		},
	})
}
