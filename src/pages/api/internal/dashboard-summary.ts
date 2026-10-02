import type { APIRoute } from "astro"
import { db, eq, Product } from "@/shared/infrastructure/db/compat"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { listProductOperationalPreparation } from "@/lib/product/productOperationalSurface"
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
			state: Product.publicationState,
		})
		.from(Product)
		.where(eq(Product.providerId, providerId))

	const productIds = products.map((product) => product.id)

	const statusMap = new Map(
		products.map((product) => [
			product.id,
			String(product.state ?? "draft")
				.trim()
				.toLowerCase(),
		])
	)
	// Global counters evaluate the entire owned catalog; five is only a display limit.
	const preparationByProduct = await listProductOperationalPreparation(providerId, productIds, {
		request,
	})
	const totalProducts = products.length
	const publishedProducts = products.filter(
		(product) => statusMap.get(product.id) === "published"
	).length
	const readyToPublishProducts = products.filter((product) => {
		if (statusMap.get(product.id) === "published") return false
		const preparation = preparationByProduct.get(product.id)
		return preparation?.tourPresentation
			? preparation.tourPresentation.catalogStatus.readyToPublish
			: preparation?.readyToPublish === true
	}).length
	const preparedProducts = products.filter((product) => {
		const preparation = preparationByProduct.get(product.id)
		return preparation?.tourPresentation
			? preparation.tourPresentation.catalogStatus.prepared
			: preparation != null &&
					preparation.totalChecks != null &&
					preparation.totalChecks > 0 &&
					preparation.completedChecks === preparation.totalChecks
	}).length
	const inPreparationProducts = totalProducts - publishedProducts - readyToPublishProducts
	const listProducts = products.slice(0, 5)

	const productList = listProducts.map((product) => {
		const preparation = preparationByProduct.get(product.id)
		const state = statusMap.get(product.id) ?? "draft"
		return {
			id: product.id,
			name: product.name,
			status: state,
			statusLabel:
				state === "published"
					? "Publicado"
					: (preparation?.tourPresentation?.catalogStatus.label ??
						preparation?.statusLabel ??
						"En preparación"),
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
			preparedProducts,
			// Backward-compatible alias; never derives from persisted `ready`.
			readyProducts: readyToPublishProducts,
			readyToPublishProducts,
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
