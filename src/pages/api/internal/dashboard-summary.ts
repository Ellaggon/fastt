import type { APIRoute } from "astro"
import { db, eq, inArray, Product, ProductStatus, Variant } from "astro:db"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

export const GET: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
	const endpointName = "dashboard-summary"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	const user = await getUserFromRequest(request)
	if (!user?.email) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Provider not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const products = await db
		.select({
			id: Product.id,
			name: Product.name,
		})
		.from(Product)
		.where(eq(Product.providerId, providerId))

	const productIds = products.map((product) => product.id)

	const [variants, statuses] = productIds.length
		? await Promise.all([
				db.select({ id: Variant.id }).from(Variant).where(inArray(Variant.productId, productIds)),
				db
					.select({ productId: ProductStatus.productId, state: ProductStatus.state })
					.from(ProductStatus)
					.where(inArray(ProductStatus.productId, productIds)),
			])
		: [[], []]

	const statusMap = new Map(
		statuses.map((row) => [
			row.productId,
			String(row.state ?? "")
				.trim()
				.toLowerCase(),
		])
	)

	const readyProducts = products.filter((product) => {
		const state = statusMap.get(product.id)
		return state === "ready" || state === "published"
	}).length

	const totalProducts = products.length
	const totalVariants = variants.length
	const pendingProducts = Math.max(0, totalProducts - readyProducts)

	const productList = products.slice(0, 5).map((product) => {
		const state = statusMap.get(product.id) ?? "draft"
		return {
			id: product.id,
			name: product.name,
			status: state,
			href: `/product/${encodeURIComponent(product.id)}`,
		}
	})

	logEndpoint()
	return new Response(
		JSON.stringify({
			totalProducts,
			totalVariants,
			readyProducts,
			pendingProducts,
			products: productList,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
