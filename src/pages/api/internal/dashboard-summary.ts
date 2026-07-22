import type { APIRoute } from "astro"
import { db, eq, inArray, Product, ProductStatus } from "@/shared/infrastructure/db/compat"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { listProductPreparationSnapshots } from "@/lib/playbook/summarize-product-preparation"
import { routes } from "@/lib/routes"

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

	const statuses = productIds.length
		? await db
				.select({ productId: ProductStatus.productId, state: ProductStatus.state })
				.from(ProductStatus)
				.where(inArray(ProductStatus.productId, productIds))
		: []

	const statusMap = new Map(
		statuses.map((row) => [
			row.productId,
			String(row.state ?? "")
				.trim()
				.toLowerCase(),
		])
	)

	const totalProducts = products.length
	const publishedProducts = products.filter(
		(product) => statusMap.get(product.id) === "published"
	).length
	const readyProducts = products.filter((product) => statusMap.get(product.id) === "ready").length
	const inPreparationProducts = Math.max(0, totalProducts - publishedProducts - readyProducts)

	const listProducts = products.slice(0, 5)
	const preparationByProduct = await listProductPreparationSnapshots(
		providerId,
		listProducts.map((product) => product.id)
	)

	const preparationSummaries = listProducts.map(
		(product) => preparationByProduct.get(product.id) ?? null
	)
	const readyToPublishFromSnapshot = preparationSummaries.filter(
		(summary) => summary && !summary.isPublished && summary.readyToPublish
	).length

	const productList = listProducts.map((product, index) => {
		const preparation = preparationSummaries[index]
		const state = statusMap.get(product.id) ?? "draft"
		return {
			id: product.id,
			name: product.name,
			status: state,
			statusLabel: preparation?.statusLabel ?? "En preparación",
			href: routes.productDetail(product.id),
			preparation: preparation
				? {
						readinessPercent: preparation.readinessPercent,
						blockerCount: preparation.blockerCount,
						blockerPreview: preparation.blockerPreview,
						readyToPublish: preparation.readyToPublish,
						continuePreparationHref: preparation.continuePreparationHref,
						previewHref: preparation.previewHref,
						nextStepLabel: preparation.nextStepLabel,
					}
				: null,
		}
	})

	logEndpoint()
	const durationMs = Number((performance.now() - startedAt).toFixed(1))
	return new Response(
		JSON.stringify({
			totalProducts,
			publishedProducts,
			inPreparationProducts,
			readyProducts,
			readyToPublishProducts: Math.max(readyProducts, readyToPublishFromSnapshot),
			products: productList,
		}),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Server-Timing": `dashboard-summary;dur=${durationMs}`,
			},
		}
	)
}
