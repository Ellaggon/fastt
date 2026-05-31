import type { APIRoute } from "astro"
import {
	and,
	asc,
	DailyInventory,
	EffectivePricingV2,
	eq,
	Image,
	inArray,
	RatePlan,
	RatePlanTemplate,
	db,
} from "astro:db"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProductVariantsAggregate } from "@/modules/catalog/public"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"

const kindLabel = (kind: string | null) => {
	const normalized = String(kind ?? "")
		.trim()
		.toLowerCase()
	if (normalized === "hotel_room") return "Habitación"
	if (normalized === "tour_slot") return "Cupo de tour"
	if (normalized === "package_base") return "Base de paquete"
	if (normalized === "limousine_service") return "Servicio de limusina"
	return normalized || "Sin tipo"
}

const readinessInventoryMinDays = 30
const INTERNAL_DEFAULT_OCCUPANCY_KEY = buildOccupancyKey(
	normalizeOccupancy({ adults: 2, children: 0, infants: 0 })
)

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
	const [effectiveRows, inventoryRows, imageRows, tariffRows] = variantIds.length
		? await Promise.all([
				db
					.select({
						variantId: RatePlan.variantId,
					})
					.from(EffectivePricingV2)
					.innerJoin(RatePlan, eq(RatePlan.id, EffectivePricingV2.ratePlanId))
					.where(
						and(
							inArray(RatePlan.variantId, variantIds),
							eq(RatePlan.isDefault, true),
							eq(EffectivePricingV2.occupancyKey, INTERNAL_DEFAULT_OCCUPANCY_KEY)
						)
					)
					.all(),
				db
					.select({
						variantId: DailyInventory.variantId,
					})
					.from(DailyInventory)
					.where(inArray(DailyInventory.variantId, variantIds))
					.all(),
				db
					.select({
						id: Image.id,
						entityId: Image.entityId,
						url: Image.url,
						order: Image.order,
						isPrimary: Image.isPrimary,
					})
					.from(Image)
					.where(
						and(
							inArray(Image.entityType, ["variant", "Variant"]),
							inArray(Image.entityId, variantIds)
						)
					)
					.orderBy(asc(Image.order), asc(Image.id))
					.all(),
				db
					.select({
						id: RatePlan.id,
						variantId: RatePlan.variantId,
						isDefault: RatePlan.isDefault,
						isActive: RatePlan.isActive,
						name: RatePlanTemplate.name,
					})
					.from(RatePlan)
					.innerJoin(RatePlanTemplate, eq(RatePlanTemplate.id, RatePlan.templateId))
					.where(inArray(RatePlan.variantId, variantIds))
					.orderBy(asc(RatePlanTemplate.name), asc(RatePlan.id))
					.all(),
			])
		: [[], [], [], []]

	const effectiveVariantSet = new Set(effectiveRows.map((row) => String(row.variantId)))
	const inventoryCountByVariant = new Map<string, number>()
	for (const row of inventoryRows) {
		const id = String(row.variantId)
		inventoryCountByVariant.set(id, Number(inventoryCountByVariant.get(id) ?? 0) + 1)
	}
	const imagesByVariant = new Map<
		string,
		Array<{ id: string; url: string; order: number; isPrimary: boolean }>
	>()
	for (const row of imageRows) {
		const id = String(row.entityId)
		const images = imagesByVariant.get(id) ?? []
		images.push({
			id: String(row.id),
			url: String(row.url ?? ""),
			order: Number(row.order ?? 0),
			isPrimary: Boolean(row.isPrimary),
		})
		imagesByVariant.set(id, images)
	}
	const tariffsByVariant = new Map<
		string,
		Array<{ id: string; name: string; isDefault: boolean; isActive: boolean }>
	>()
	for (const row of tariffRows) {
		const id = String(row.variantId)
		const tariffs = tariffsByVariant.get(id) ?? []
		tariffs.push({
			id: String(row.id),
			name: String(row.name ?? "Tarifa"),
			isDefault: Boolean(row.isDefault),
			isActive: Boolean(row.isActive ?? true),
		})
		tariffsByVariant.set(id, tariffs)
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
		const images = imagesByVariant.get(String(variant.id)) ?? []
		const coverImage = images.find((image) => image.isPrimary) ?? images[0] ?? null
		const tariffs = tariffsByVariant.get(String(variant.id)) ?? []
		const activeTariffs = tariffs.filter((tariff) => tariff.isActive)
		const defaultTariff =
			activeTariffs.find((tariff) => tariff.isDefault) ?? activeTariffs[0] ?? null
		const capacityLabel = variant.capacity
			? variant.capacity.minOccupancy === variant.capacity.maxOccupancy
				? `${variant.capacity.maxOccupancy} huésped${variant.capacity.maxOccupancy === 1 ? "" : "es"}`
				: `${variant.capacity.minOccupancy}-${variant.capacity.maxOccupancy} huéspedes`
			: "Capacidad pendiente"
		const typeLabel = String(variant.subtype?.name ?? kindLabel(variant.kind))
		const inventoryLabel =
			inventoryDays > 0
				? `${inventoryDays} noches con disponibilidad configurada`
				: "Disponibilidad pendiente"
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
			status: String(variant.status ?? "draft")
				.trim()
				.toLowerCase(),
			kindLabel: kindLabel(variant.kind),
			type: {
				label: typeLabel,
				roomTypeId: variant.subtype?.roomTypeId ?? null,
			},
			capacity: {
				label: capacityLabel,
				minGuests: variant.capacity?.minOccupancy ?? null,
				maxGuests: variant.capacity?.maxOccupancy ?? null,
				maxAdults: variant.capacity?.maxAdults ?? null,
				maxChildren: variant.capacity?.maxChildren ?? null,
			},
			photos: {
				count: images.length,
				coverUrl: coverImage?.url ?? null,
			},
			inventory: {
				days: inventoryDays,
				label: inventoryLabel,
				minimumDays: readinessInventoryMinDays,
			},
			tariffs: {
				count: activeTariffs.length,
				names: activeTariffs.map((tariff) => tariff.name),
				defaultName: defaultTariff?.name ?? null,
			},
			states: {
				capacityComplete,
				subtypeComplete,
				pricingComplete,
				inventoryComplete,
				photosComplete: images.length > 0,
				tariffsComplete: activeTariffs.length > 0,
				isComplete,
			},
			actions: {
				detailHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}`,
				capacityHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}/profile`,
				typeHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}/profile`,
				profileHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}/profile`,
				inventoryHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}/inventory`,
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
