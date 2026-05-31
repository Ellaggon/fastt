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
	RoomType,
	VariantRoomAmenity,
	VariantRoomBed,
	VariantRoomProfile,
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
	const endpointName = "room-summary"
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
	// roomType is temporarily optional to avoid blocking rooms in environments
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
	const roomProfile = await db
		.select({
			variantId: VariantRoomProfile.variantId,
			roomTypeId: VariantRoomProfile.roomTypeId,
			roomTypeName: RoomType.name,
			totalRooms: VariantRoomProfile.totalRooms,
			sizeM2: VariantRoomProfile.sizeM2,
			viewType: VariantRoomProfile.viewType,
			bathroomCount: VariantRoomProfile.bathroomCount,
			bathroomType: VariantRoomProfile.bathroomType,
			hasBalcony: VariantRoomProfile.hasBalcony,
			guestFacingNotes: VariantRoomProfile.guestFacingNotes,
		})
		.from(VariantRoomProfile)
		.leftJoin(RoomType, eq(RoomType.id, VariantRoomProfile.roomTypeId))
		.where(eq(VariantRoomProfile.variantId, variantId))
		.get()
	const roomBeds = await db
		.select({
			bedType: VariantRoomBed.bedType,
			count: VariantRoomBed.count,
			roomLabel: VariantRoomBed.roomLabel,
		})
		.from(VariantRoomBed)
		.where(eq(VariantRoomBed.variantId, variantId))
		.orderBy(asc(VariantRoomBed.sortOrder))
		.all()
	const roomAmenityCount = Number(
		(
			await db
				.select({ value: count() })
				.from(VariantRoomAmenity)
				.where(eq(VariantRoomAmenity.variantId, variantId))
				.get()
		)?.value ?? 0
	)

	const pricingComplete = Boolean(
		aggregate.baseRate && aggregate.defaultRatePlan && effectivePricingDays > 0
	)
	const inventoryComplete = dailyInventoryDays >= readinessInventoryMinDays
	const profileComplete = Boolean(aggregate.capacity && roomProfile && roomBeds.length > 0)
	const blocks = [
		{ key: "profile", complete: profileComplete },
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
			message: "Precios efectivos pendientes",
		})
	}
	if (!inventoryComplete) {
		syntheticBlockingErrors.push({
			code: "inventory_missing",
			message: `Disponibilidad diaria pendiente (${dailyInventoryDays}/${readinessInventoryMinDays})`,
		})
	}
	const allErrors = [...errors, ...syntheticBlockingErrors]
	const blockingErrors = allErrors.filter((error) => blockingCodes.has(error.code))
	const nonBlockingErrors = allErrors.filter((error) => !blockingCodes.has(error.code))

	const readinessState = completedBlocks === totalBlocks ? "ready" : "draft"
	const readinessStateLabel = readinessState === "ready" ? "Lista" : "Borrador"
	const readinessStateVariant = readinessState === "ready" ? "success" : "warning"

	const pricingSummary = aggregate.baseRate
		? `${aggregate.baseRate.currency} ${aggregate.baseRate.basePrice}${aggregate.defaultRatePlan ? " · tarifa comercial activa" : " · falta tarifa comercial"}${effectivePricingDays > 0 ? ` · ${effectivePricingDays} día(s) con precios efectivos` : " · precios efectivos pendientes"}${coverageGaps > 0 ? ` · Faltan precios para ${coverageGaps} día(s)` : ""}`
		: "Sin precio base"
	const bedSummary = roomBeds.length
		? roomBeds
				.map((bed) => `${Number(bed.count ?? 1)} ${String(bed.bedType ?? "cama")}`)
				.join(" · ")
		: "Camas pendientes"
	const roomTypeLabel =
		String(
			roomProfile?.roomTypeName ?? aggregate.subtype?.name ?? aggregate.subtype?.roomTypeId ?? ""
		).trim() || "Tipo pendiente"
	const bathroomLabel =
		roomProfile?.bathroomCount != null
			? `${roomProfile.bathroomCount} baño(s)${roomProfile.bathroomType ? ` · ${roomProfile.bathroomType}` : ""}`
			: "Baño pendiente"
	const profileSummary = profileComplete
		? `${roomTypeLabel} · ${aggregate.capacity?.minOccupancy}-${aggregate.capacity?.maxOccupancy} huéspedes · ${bedSummary} · ${bathroomLabel}${roomAmenityCount > 0 ? ` · ${roomAmenityCount} comodidad(es)` : ""}`
		: [
				!aggregate.capacity ? "capacidad" : null,
				!roomProfile ? "perfil físico" : null,
				roomBeds.length === 0 ? "camas" : null,
			]
				.filter(Boolean)
				.join(", ") || "Ficha incompleta"

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
							context: "room-summary",
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
				profile: {
					complete: profileComplete,
					summary: profileSummary,
				},
				capacity: {
					complete: capacityComplete,
					summary: aggregate.capacity
						? `${aggregate.capacity.minOccupancy} - ${aggregate.capacity.maxOccupancy} huéspedes`
						: "Falta definir límites de ocupación",
				},
				subtype: {
					complete: subtypeComplete,
					summary: subtypeComplete
						? (aggregate.subtype?.roomTypeId ?? "No requerido para esta habitación")
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
						? `${dailyInventoryDays} día(s) con disponibilidad diaria`
						: `Disponibilidad diaria pendiente (${dailyInventoryDays}/${readinessInventoryMinDays})`,
				},
			},
			summary: {
				profile: profileSummary,
				capacity: aggregate.capacity
					? `Min ${aggregate.capacity.minOccupancy} · Max ${aggregate.capacity.maxOccupancy} · Adultos ${aggregate.capacity.maxAdults ?? "-"} · Niños ${aggregate.capacity.maxChildren ?? "-"}`
					: "Sin capacidad registrada",
				subtype: aggregate.subtype
					? `Tipo de habitación: ${aggregate.subtype.roomTypeId}`
					: "Sin tipo de habitación registrado",
				pricing: pricingSummary,
				inventory: inventoryComplete
					? `${dailyInventoryDays} día(s) con disponibilidad diaria`
					: `Disponibilidad diaria pendiente (${dailyInventoryDays}/${readinessInventoryMinDays})`,
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
