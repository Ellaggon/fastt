import type { APIRoute } from "astro"
import { and, DailyInventory, EffectivePricing, eq, inArray, RatePlan, db } from "astro:db"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProductVariantsAggregate } from "@/modules/catalog/public"

const kindLabel = (kind: string | null) => {
	const normalized = String(kind ?? "")
		.trim()
		.toLowerCase()
	if (normalized === "hotel_room") return "Habitación"
	if (normalized === "tour_slot") return "Cupo de tour"
	if (normalized === "package_base") return "Base de paquete"
	return normalized || "Sin tipo"
}

const readinessInventoryMinDays = 30

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "variants-summary"
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

	const productId = String(url.searchParams.get("productId") ?? "").trim()
	if (!productId) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "productId is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const aggregate = await getProductVariantsAggregate(productId, providerId)
	if (!aggregate) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const variantIds = aggregate.variants.map((variant) => String(variant.id)).filter(Boolean)
	const [effectiveRows, inventoryRows] = variantIds.length
		? await Promise.all([
				db
					.select({
						variantId: RatePlan.variantId,
					})
					.from(EffectivePricing)
					.innerJoin(RatePlan, eq(RatePlan.id, EffectivePricing.ratePlanId))
					.where(and(inArray(RatePlan.variantId, variantIds), eq(RatePlan.isDefault, true)))
					.all(),
				db
					.select({
						variantId: DailyInventory.variantId,
					})
					.from(DailyInventory)
					.where(inArray(DailyInventory.variantId, variantIds))
					.all(),
			])
		: [[], []]

	const effectiveVariantSet = new Set(effectiveRows.map((row) => String(row.variantId)))
	const inventoryCountByVariant = new Map<string, number>()
	for (const row of inventoryRows) {
		const id = String(row.variantId)
		inventoryCountByVariant.set(id, Number(inventoryCountByVariant.get(id) ?? 0) + 1)
	}

	const variants = aggregate.variants.map((variant) => {
		const capacityComplete = Boolean(variant.capacity)
		const subtypeComplete = Boolean(variant.subtype)
		const pricingComplete = Boolean(
			variant.pricing?.hasBaseRate &&
				variant.pricing?.hasDefaultRatePlan &&
				effectiveVariantSet.has(String(variant.id))
		)
		const inventoryDays = Number(inventoryCountByVariant.get(String(variant.id)) ?? 0)
		const inventoryComplete = inventoryDays >= readinessInventoryMinDays
		const completedBlocks = [
			capacityComplete,
			subtypeComplete,
			pricingComplete,
			inventoryComplete,
		].filter(Boolean).length
		const isComplete = completedBlocks === 4

		return {
			id: variant.id,
			name: variant.name,
			kindLabel: kindLabel(variant.kind),
			states: {
				capacityComplete,
				subtypeComplete,
				pricingComplete,
				inventoryComplete,
				isComplete,
			},
			actions: {
				detailHref: `/product/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variant.id)}`,
			},
		}
	})

	const completedVariants = variants.filter((variant) => variant.states.isComplete).length
	const totalVariants = variants.length
	const incompleteVariants = Math.max(0, totalVariants - completedVariants)
	const progressPercent =
		totalVariants > 0 ? Math.round((completedVariants / totalVariants) * 100) : 0
	const productStatus = String(aggregate.product.status ?? "draft")
		.trim()
		.toLowerCase()
	const statusLabel =
		productStatus === "published" ? "Publicado" : productStatus === "ready" ? "Listo" : "Borrador"
	const statusVariant =
		productStatus === "published" ? "success" : productStatus === "ready" ? "info" : "warning"

	logEndpoint()
	return new Response(
		JSON.stringify({
			product: {
				id: aggregate.product.id,
				displayName: aggregate.product.displayName,
				status: productStatus,
				statusLabel,
				statusVariant,
			},
			progress: {
				totalVariants,
				completedVariants,
				incompleteVariants,
				progressPercent,
			},
			variants,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
