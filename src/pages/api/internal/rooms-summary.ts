import type { APIRoute } from "astro"
import {
	and,
	asc,
	DailyInventory,
	eq,
	gt,
	HouseRule,
	Image,
	VariantImage,
	inArray,
	RatePlan,
	db,
} from "@/shared/infrastructure/db/compat"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"
import { loadVariantCompletionForAggregateVariant } from "@/lib/playbook/evaluate-add-room-progress"
import { getAggregateCache, setAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { getProductVariantsAggregate } from "@/modules/catalog/public"

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

type RoomOperationalCode =
	| "sellable"
	| "profile-incomplete"
	| "photos-pending"
	| "no-rate"
	| "price-pending"
	| "conditions-pending"
	| "no-availability"
	| "rate-draft"

const operationalStatus = (input: {
	profileComplete: boolean
	photosComplete: boolean
	rateConfigured: boolean
	pricingComplete: boolean
	conditionsComplete: boolean
	availabilityComplete: boolean
	rateActive: boolean
	rateDefault: boolean
	sellable: boolean
}): { code: RoomOperationalCode; label: string; tone: "success" | "warning"; nextStep: string } => {
	if (input.sellable) {
		return { code: "sellable", label: "Vendible", tone: "success", nextStep: "detail" }
	}
	if (!input.profileComplete) {
		return {
			code: "profile-incomplete",
			label: "Perfil incompleto",
			tone: "warning",
			nextStep: "profile",
		}
	}
	if (!input.photosComplete) {
		return {
			code: "photos-pending",
			label: "Fotos pendientes",
			tone: "warning",
			nextStep: "photos",
		}
	}
	if (!input.rateConfigured) {
		return { code: "no-rate", label: "Sin tarifa", tone: "warning", nextStep: "rate" }
	}
	if (!input.pricingComplete) {
		return { code: "price-pending", label: "Precio pendiente", tone: "warning", nextStep: "rate" }
	}
	if (!input.conditionsComplete) {
		return {
			code: "conditions-pending",
			label: "Condiciones pendientes",
			tone: "warning",
			nextStep: "conditions",
		}
	}
	if (!input.availabilityComplete) {
		return {
			code: "no-availability",
			label: "Sin disponibilidad",
			tone: "warning",
			nextStep: "availability",
		}
	}
	return {
		code: "rate-draft",
		label: "Tarifa en borrador",
		tone: "warning",
		nextStep: !input.rateActive || !input.rateDefault ? "availability" : "detail",
	}
}

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "rooms-summary"
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
	const cacheKey = `rooms-summary:${providerId}:${productId}`
	const cached = getAggregateCache<Record<string, unknown>>(cacheKey)
	if (cached) {
		logEndpoint()
		return new Response(JSON.stringify(cached), {
			status: 200,
			headers: { "Content-Type": "application/json", "X-Fastt-Cache": "hit" },
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
	const todayIso = new Date().toISOString().slice(0, 10)
	// Keep operational cards aligned with the add-room playbook. A room is sellable
	// only when the same profile, photo, commercial, policy and inventory checks pass.
	const completionByVariant = new Map(
		(
			await Promise.all(
				aggregate.variants.map(
					async (variant) =>
						[
							String(variant.id),
							await loadVariantCompletionForAggregateVariant(productId, variant),
						] as const
				)
			)
		).filter((entry) => entry[1])
	)
	const ratePlanName = await resolveRatePlanNameColumn()
	const [inventoryRows, imageRows, tariffRows, houseRuleRows] = variantIds.length
		? await Promise.all([
				db
					.select({
						variantId: DailyInventory.variantId,
					})
					.from(DailyInventory)
					.where(
						and(
							inArray(DailyInventory.variantId, variantIds),
							gt(DailyInventory.date, todayIso),
							gt(DailyInventory.totalInventory, 0)
						)
					),
				db
					.select({
						id: Image.id,
						variantId: VariantImage.variantId,
						url: Image.url,
						order: VariantImage.sortOrder,
						isPrimary: VariantImage.isPrimary,
					})
					.from(VariantImage)
					.innerJoin(Image, eq(Image.id, VariantImage.imageId))
					.where(inArray(VariantImage.variantId, variantIds))
					.orderBy(asc(VariantImage.sortOrder), asc(Image.id)),
				db
					.select({
						id: RatePlan.id,
						variantId: RatePlan.variantId,
						isDefault: RatePlan.isDefault,
						isActive: RatePlan.isActive,
						name: ratePlanName,
					})
					.from(RatePlan)
					.where(inArray(RatePlan.variantId, variantIds))
					.orderBy(asc(ratePlanName), asc(RatePlan.id)),
				db
					.select({ scopeId: HouseRule.scopeId })
					.from(HouseRule)
					.where(
						and(
							eq(HouseRule.productId, productId),
							eq(HouseRule.scope, "variant"),
							inArray(HouseRule.scopeId, variantIds)
						)
					),
			])
		: [[], [], [], []]

	const houseRuleOverrideCountByVariant = new Map<string, number>()
	for (const row of houseRuleRows) {
		const variantId = String(row.scopeId ?? "")
		houseRuleOverrideCountByVariant.set(
			variantId,
			Number(houseRuleOverrideCountByVariant.get(variantId) ?? 0) + 1
		)
	}

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
		const id = String(row.variantId)
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
		const completion = completionByVariant.get(String(variant.id))
		const capacityComplete = completion?.profileComplete ?? Boolean(variant.capacity)
		const subtypeComplete = Boolean(variant.subtype)
		const pricingComplete = completion?.pricingComplete ?? false
		const inventoryDays = Number(inventoryCountByVariant.get(String(variant.id)) ?? 0)
		const inventoryComplete = inventoryDays >= readinessInventoryMinDays
		const images = imagesByVariant.get(String(variant.id)) ?? []
		const coverImage = images.find((image) => image.isPrimary) ?? images[0] ?? null
		const tariffs = tariffsByVariant.get(String(variant.id)) ?? []
		const activeTariffs = tariffs.filter((tariff) => tariff.isActive)
		const selectedRatePlanId = completion?.selectedRatePlanId ?? null
		const defaultTariff =
			(selectedRatePlanId
				? tariffs.find((tariff) => String(tariff.id) === selectedRatePlanId)
				: null) ??
			activeTariffs.find((tariff) => tariff.isDefault) ??
			activeTariffs[0] ??
			tariffs[0] ??
			null
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
		const photosComplete = completion?.photosComplete ?? images.length > 0
		const rateConfigured = completion?.rateConfigured ?? tariffs.length > 0
		const rateActive = completion?.rateActive ?? Boolean(defaultTariff?.isActive)
		const rateDefault = completion?.rateDefault ?? Boolean(defaultTariff?.isDefault)
		const tariffsComplete = rateConfigured
		const conditionsComplete = completion?.conditionsComplete ?? false
		const isComplete = completion?.sellable ?? false
		const availabilityComplete = completion?.availabilityComplete ?? inventoryComplete
		const profileComplete = completion?.profileComplete ?? capacityComplete
		const operational = operationalStatus({
			profileComplete,
			photosComplete,
			rateConfigured,
			pricingComplete,
			conditionsComplete,
			availabilityComplete,
			rateActive,
			rateDefault,
			sellable: isComplete,
		})

		return {
			id: variant.id,
			name: variant.name,
			status: String(variant.lifecycleState ?? "draft")
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
			houseRules: {
				overrideCount: Number(houseRuleOverrideCountByVariant.get(String(variant.id)) ?? 0),
			},
			tariffs: {
				count: tariffs.length,
				activeCount: activeTariffs.length,
				names: tariffs.map((tariff) => tariff.name),
				defaultName: defaultTariff?.name ?? null,
				defaultId: defaultTariff?.id ?? null,
			},
			states: {
				capacityComplete: profileComplete,
				subtypeComplete,
				pricingComplete,
				inventoryComplete: availabilityComplete,
				photosComplete,
				tariffsComplete,
				conditionsComplete,
				rateConfigured,
				rateActive,
				rateDefault,
				inventoryConfigComplete: completion?.inventoryConfigComplete ?? false,
				setupComplete: completion?.setupComplete ?? false,
				sellable: completion?.sellable ?? false,
				isComplete,
			},
			operational,
			actions: {
				detailHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}`,
				capacityHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}/profile`,
				typeHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}/profile`,
				profileHref: `/product/${encodeURIComponent(productId)}/rooms/${encodeURIComponent(variant.id)}/profile`,
				tariffsHref: defaultTariff?.id
					? `/rates/plans/${encodeURIComponent(String(defaultTariff.id))}`
					: `/rates/plans/manage`,
				conditionsHref: defaultTariff?.id
					? `/rates/plans/${encodeURIComponent(String(defaultTariff.id))}?vista=conditions`
					: `/rates/plans/manage`,
				calendarHref: defaultTariff?.id
					? `/rates/calendar?ratePlanId=${encodeURIComponent(String(defaultTariff.id))}&variantId=${encodeURIComponent(String(variant.id))}`
					: `/rates/calendar?variantId=${encodeURIComponent(String(variant.id))}`,
				inventoryHref: `/rates/calendar?variantId=${encodeURIComponent(String(variant.id))}&focus=availability`,
				houseRulesHref: `/provider/house-rules?productId=${encodeURIComponent(productId)}&variantId=${encodeURIComponent(String(variant.id))}`,
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

	const payload = {
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
	}
	setAggregateCache(cacheKey, payload, {
		tags: [`provider:${providerId}`, `product:${productId}`],
	})

	logEndpoint()
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "Content-Type": "application/json", "X-Fastt-Cache": "miss" },
	})
}
