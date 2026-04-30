import type { APIRoute } from "astro"
import {
	and,
	count,
	DailyInventory,
	EffectivePricingV2,
	eq,
	db,
	desc,
	asc,
	Image,
	inArray,
} from "astro:db"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { ensureObjectKey } from "@/lib/images/objectKey"
import { getVariantFullAggregate } from "@/modules/catalog/public"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"

const blockingCodes = new Set([
	"missing_capacity",
	"missing_subtype",
	"pricing_missing",
	"no_default_rate_plan",
	"pricing_invalid",
	"effective_pricing_missing",
	"inventory_missing",
])
const readinessInventoryMinDays = 30
const INTERNAL_DEFAULT_OCCUPANCY_KEY = buildOccupancyKey(
	normalizeOccupancy({ adults: 2, children: 0, infants: 0 })
)

const normalizeErrors = (value: unknown): Array<{ code: string; message: string }> => {
	if (!Array.isArray(value)) return []
	return value
		.map((item) => {
			if (!item || typeof item !== "object") return null
			const code = String((item as { code?: unknown }).code ?? "").trim()
			const message = String((item as { message?: unknown }).message ?? "").trim()
			if (!code && !message) return null
			return { code, message: message || code }
		})
		.filter((item): item is { code: string; message: string } => Boolean(item))
}

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "variant-summary"
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
	const variantId = String(url.searchParams.get("variantId") ?? "").trim()
	if (!productId || !variantId) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "productId and variantId are required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const aggregate = await getVariantFullAggregate(productId, variantId, providerId)
	if (!aggregate) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const status = String(aggregate.variant.status ?? "draft")
		.trim()
		.toLowerCase()
	const statusLabel =
		status === "published" ? "Publicada" : status === "ready" ? "Lista" : "Borrador"
	const statusVariant = status === "published" ? "success" : status === "ready" ? "info" : "warning"

	const capacityComplete = Boolean(aggregate.capacity)
	// CAPA 4.6:
	// roomType is temporarily optional to avoid blocking variants in environments
	// without seeded RoomType data.
	const subtypeComplete = true
	const defaultRatePlanId = String(aggregate.defaultRatePlan?.ratePlanId ?? "").trim()
	const effectivePricingDays = defaultRatePlanId
		? Number(
				(
					await db
						.select({ value: count() })
						.from(EffectivePricingV2)
						.where(
							and(
								eq(EffectivePricingV2.variantId, variantId),
								eq(EffectivePricingV2.ratePlanId, defaultRatePlanId),
								eq(EffectivePricingV2.occupancyKey, INTERNAL_DEFAULT_OCCUPANCY_KEY)
							)
						)
						.get()
				)?.value ?? 0
			)
		: 0
	const dailyInventoryDays = Number(
		(
			await db
				.select({ value: count() })
				.from(DailyInventory)
				.where(eq(DailyInventory.variantId, variantId))
				.get()
		)?.value ?? 0
	)
	const effectiveCoverageStart = defaultRatePlanId
		? await db
				.select({ date: EffectivePricingV2.date })
				.from(EffectivePricingV2)
				.where(
					and(
						eq(EffectivePricingV2.variantId, variantId),
						eq(EffectivePricingV2.ratePlanId, defaultRatePlanId),
						eq(EffectivePricingV2.occupancyKey, INTERNAL_DEFAULT_OCCUPANCY_KEY)
					)
				)
				.orderBy(asc(EffectivePricingV2.date))
				.limit(1)
				.get()
		: null
	const effectiveCoverageEnd = defaultRatePlanId
		? await db
				.select({ date: EffectivePricingV2.date })
				.from(EffectivePricingV2)
				.where(
					and(
						eq(EffectivePricingV2.variantId, variantId),
						eq(EffectivePricingV2.ratePlanId, defaultRatePlanId),
						eq(EffectivePricingV2.occupancyKey, INTERNAL_DEFAULT_OCCUPANCY_KEY)
					)
				)
				.orderBy(desc(EffectivePricingV2.date))
				.limit(1)
				.get()
		: null
	const coverageGaps = Math.max(readinessInventoryMinDays - effectivePricingDays, 0)
	const variantImages = await db
		.select({
			id: Image.id,
			url: Image.url,
			objectKey: Image.objectKey,
			order: Image.order,
			isPrimary: Image.isPrimary,
		})
		.from(Image)
		.where(and(inArray(Image.entityType, ["variant", "Variant"]), eq(Image.entityId, variantId)))
		.orderBy(asc(Image.order), asc(Image.id))
		.all()

	const pricingComplete = Boolean(
		aggregate.baseRate && aggregate.defaultRatePlan && effectivePricingDays > 0
	)
	const inventoryComplete = dailyInventoryDays >= readinessInventoryMinDays
	const blocks = [
		{ key: "capacity", complete: capacityComplete },
		{ key: "subtype", complete: subtypeComplete },
		{ key: "pricing", complete: pricingComplete },
		{ key: "inventory", complete: inventoryComplete },
	]
	const completedBlocks = blocks.filter((block) => block.complete).length
	const totalBlocks = blocks.length
	const pendingBlocks = totalBlocks - completedBlocks
	const progressPercent = Math.round((completedBlocks / totalBlocks) * 100)

	const errors = normalizeErrors(aggregate.readiness?.validationErrorsJson)
	const syntheticBlockingErrors: Array<{ code: string; message: string }> = []
	if (!pricingComplete) {
		syntheticBlockingErrors.push({
			code: "effective_pricing_missing",
			message: "Pricing efectivo no generado",
		})
	}
	if (!inventoryComplete) {
		syntheticBlockingErrors.push({
			code: "inventory_missing",
			message: `Inventario diario no generado (${dailyInventoryDays}/${readinessInventoryMinDays})`,
		})
	}
	const allErrors = [...errors, ...syntheticBlockingErrors]
	const blockingErrors = allErrors.filter((error) => blockingCodes.has(error.code))
	const nonBlockingErrors = allErrors.filter((error) => !blockingCodes.has(error.code))

	const readinessState = completedBlocks === totalBlocks ? "ready" : "draft"
	const readinessStateLabel = readinessState === "ready" ? "Lista" : "Borrador"
	const readinessStateVariant = readinessState === "ready" ? "success" : "warning"

	const pricingSummary = aggregate.baseRate
		? `${aggregate.baseRate.currency} ${aggregate.baseRate.basePrice}${aggregate.defaultRatePlan ? " · plan por defecto activo" : " · falta plan por defecto"}${effectivePricingDays > 0 ? ` · ${effectivePricingDays} día(s) con pricing efectivo` : " · pricing efectivo pendiente"}${coverageGaps > 0 ? ` · Faltan precios para ${coverageGaps} día(s)` : ""}`
		: "Sin tarifa base"

	logEndpoint()
	return new Response(
		JSON.stringify({
			variant: {
				id: aggregate.variant.id,
				productId: aggregate.variant.productId,
				name: aggregate.variant.name,
				kind: aggregate.variant.kind,
				status,
				statusLabel,
				statusVariant,
				images: variantImages.map((image) => ({
					id: String(image.id),
					url: String(image.url),
					objectKey:
						ensureObjectKey({
							objectKey: image.objectKey ? String(image.objectKey) : null,
							url: String(image.url),
							context: "variant-summary",
							imageId: String(image.id),
						}) ?? null,
					order: Number(image.order ?? 0),
					isPrimary: Boolean(image.isPrimary),
				})),
			},
			progress: {
				completedBlocks,
				totalBlocks,
				pendingBlocks,
				progressPercent,
			},
			blocks: {
				capacity: {
					complete: capacityComplete,
					summary: aggregate.capacity
						? `${aggregate.capacity.minOccupancy} - ${aggregate.capacity.maxOccupancy} huéspedes`
						: "Falta definir límites de ocupación",
				},
				subtype: {
					complete: subtypeComplete,
					summary: subtypeComplete
						? (aggregate.subtype?.roomTypeId ?? "No requerido para este tipo de variante")
						: "Falta seleccionar tipo de habitación",
				},
				pricing: {
					complete: pricingComplete,
					summary: pricingSummary,
					coverage: {
						coverageStart: effectiveCoverageStart?.date ?? null,
						coverageEnd: effectiveCoverageEnd?.date ?? null,
						totalDaysCovered: effectivePricingDays,
						missingDays: coverageGaps,
					},
				},
				inventory: {
					complete: inventoryComplete,
					summary: inventoryComplete
						? `${dailyInventoryDays} día(s) de inventario diario generado`
						: `Inventario diario no generado (${dailyInventoryDays}/${readinessInventoryMinDays})`,
				},
			},
			summary: {
				capacity: aggregate.capacity
					? `Min ${aggregate.capacity.minOccupancy} · Max ${aggregate.capacity.maxOccupancy} · Adultos ${aggregate.capacity.maxAdults ?? "-"} · Niños ${aggregate.capacity.maxChildren ?? "-"}`
					: "Sin capacidad registrada",
				subtype: aggregate.subtype
					? `Tipo de habitación: ${aggregate.subtype.roomTypeId}`
					: "Sin subtipo registrado",
				pricing: pricingSummary,
				inventory: inventoryComplete
					? `${dailyInventoryDays} día(s) de inventario diario generado`
					: `Inventario diario no generado (${dailyInventoryDays}/${readinessInventoryMinDays})`,
			},
			readiness: {
				state: readinessState,
				stateLabel: readinessStateLabel,
				stateVariant: readinessStateVariant,
				blockingErrors,
				nonBlockingErrors,
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
