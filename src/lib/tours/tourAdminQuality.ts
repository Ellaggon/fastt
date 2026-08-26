import {
	and,
	count,
	db,
	eq,
	Image,
	inArray,
	Product,
	ProductCategoryLink,
	RatePlan,
	Tour,
	TourSlotProfile,
	TourTicketType,
	Variant,
	VariantCapacity,
} from "@/shared/infrastructure/db/compat"

/** Benchmark Airbnb/Viator-style photo floor for publish. */
export const TOUR_QUALITY_MIN_IMAGES = 5
export const TOUR_QUALITY_MIN_ITINERARY_STEPS = 3

export type TourQualityIssue =
	| "missing_images"
	| "thin_itinerary"
	| "missing_meeting_point"
	| "missing_duration"
	| "missing_includes"
	| "missing_category"
	| "missing_active_tickets"
	| "no_complete_salida"
	| "no_active_salida"
	| "draft_status"

export type TourQualityAction = {
	issue: TourQualityIssue
	severity: "blocker" | "warning"
	label: string
	href: string
}

export type TourQualityRow = {
	productId: string
	name: string
	providerId: string | null
	status: string
	imageCount: number
	itinerarySteps: number
	hasMeetingPoint: boolean
	hasDurationMinutes: boolean
	hasIncludes: boolean
	categoryCount: number
	activeTicketCount: number
	activeSalidaCount: number
	completeSalidaCount: number
	score: number
	issues: TourQualityIssue[]
	blockers: TourQualityIssue[]
	warnings: TourQualityIssue[]
	actions: TourQualityAction[]
	reviewHref: string
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
}

/** Shared meeting-point truth for admin score + publish readiness. */
export function tourHasMeetingPoint(value: unknown): boolean {
	if (!value || typeof value !== "object") return false
	const row = value as Record<string, unknown>
	const label = String(row.label ?? row.name ?? row.address ?? "").trim()
	const lat = Number(row.lat ?? row.latitude)
	const lng = Number(row.lng ?? row.longitude)
	return Boolean(label) || (Number.isFinite(lat) && Number.isFinite(lng))
}

export type TourQualityScoreInput = {
	status: string | null | undefined
	imageCount: number
	itinerarySteps: number
	hasMeetingPoint: boolean
	hasDurationMinutes: boolean
	hasIncludes: boolean
	categoryCount: number
	activeTicketCount: number
	activeSalidaCount: number
	completeSalidaCount: number
}

export type TourPublicationValidationError = {
	code: string
	message: string
}

const PUBLICATION_ERROR_BY_BLOCKER: Record<
	Exclude<TourQualityIssue, "draft_status" | "no_active_salida">,
	TourPublicationValidationError
> = {
	missing_images: {
		code: "missing_tour_images",
		message: `At least ${TOUR_QUALITY_MIN_IMAGES} photos are required before publishing a tour`,
	},
	thin_itinerary: {
		code: "missing_tour_itinerary",
		message: `Tour itinerary requires at least ${TOUR_QUALITY_MIN_ITINERARY_STEPS} steps`,
	},
	missing_meeting_point: {
		code: "missing_tour_meeting_point",
		message: "Tour meeting point is required",
	},
	missing_duration: {
		code: "missing_tour_duration",
		message: "Tour duration (minutes) is required",
	},
	missing_includes: {
		code: "missing_tour_includes",
		message: "Tour includes list is required",
	},
	missing_category: {
		code: "missing_tour_category",
		message: "At least one ProductCategoryLink is required",
	},
	missing_active_tickets: {
		code: "missing_tour_tickets",
		message: "At least one active TourTicketType is required",
	},
	no_complete_salida: {
		code: "missing_tour_schedule",
		message: "At least one salida with profile, capacity and rate is required",
	},
}

const ISSUE_META: Record<
	TourQualityIssue,
	{ severity: "blocker" | "warning"; label: string; path: (id: string) => string }
> = {
	missing_images: {
		severity: "blocker",
		label: `Sube al menos ${TOUR_QUALITY_MIN_IMAGES} fotos`,
		path: (id) => `/product/${id}/images`,
	},
	thin_itinerary: {
		severity: "blocker",
		label: `Itinerario con ≥${TOUR_QUALITY_MIN_ITINERARY_STEPS} pasos`,
		path: (id) => `/product/${id}/subtype`,
	},
	missing_meeting_point: {
		severity: "blocker",
		label: "Completa el punto de encuentro",
		path: (id) => `/product/${id}/subtype`,
	},
	missing_duration: {
		severity: "blocker",
		label: "Define duración (minutos)",
		path: (id) => `/product/${id}/subtype`,
	},
	missing_includes: {
		severity: "blocker",
		label: "Añade qué incluye la experiencia",
		path: (id) => `/product/${id}/subtype`,
	},
	missing_category: {
		severity: "blocker",
		label: "Asigna categoría de discovery",
		path: (id) => `/product/${id}/tickets`,
	},
	missing_active_tickets: {
		severity: "blocker",
		label: "Activa al menos un tipo de ticket",
		path: (id) => `/product/${id}/tickets`,
	},
	no_complete_salida: {
		severity: "blocker",
		label: "Crea una salida con profile, cupo y tarifa",
		path: (id) => `/product/${id}/departures`,
	},
	no_active_salida: {
		severity: "warning",
		label: "Activa al menos una salida",
		path: (id) => `/product/${id}/departures`,
	},
	draft_status: {
		severity: "warning",
		label: "Publicar cuando los blockers estén resueltos",
		path: (id) => `/product/${id}`,
	},
}

/** Score 0–100; blockers vs warnings separated for publish gate + admin triage. */
export function scoreTourQuality(input: TourQualityScoreInput): {
	score: number
	issues: TourQualityIssue[]
	blockers: TourQualityIssue[]
	warnings: TourQualityIssue[]
} {
	const issues: TourQualityIssue[] = []
	let score = 100
	const status = String(input.status ?? "draft")
		.trim()
		.toLowerCase()

	if (input.imageCount < TOUR_QUALITY_MIN_IMAGES) {
		issues.push("missing_images")
		score -= input.imageCount === 0 ? 28 : 14
	}
	if (input.itinerarySteps < TOUR_QUALITY_MIN_ITINERARY_STEPS) {
		issues.push("thin_itinerary")
		score -= input.itinerarySteps === 0 ? 28 : 12
	}
	if (!input.hasMeetingPoint) {
		issues.push("missing_meeting_point")
		score -= 12
	}
	if (!input.hasDurationMinutes) {
		issues.push("missing_duration")
		score -= 8
	}
	if (!input.hasIncludes) {
		issues.push("missing_includes")
		score -= 8
	}
	if (input.categoryCount < 1) {
		issues.push("missing_category")
		score -= 10
	}
	if (input.activeTicketCount < 1) {
		issues.push("missing_active_tickets")
		score -= 10
	}
	if (input.completeSalidaCount < 1) {
		issues.push("no_complete_salida")
		score -= 20
	} else if (input.activeSalidaCount < 1) {
		issues.push("no_active_salida")
		score -= 8
	}
	if (status !== "published") {
		issues.push("draft_status")
		score -= 6
	}

	const blockers = issues.filter((issue) => ISSUE_META[issue].severity === "blocker")
	const warnings = issues.filter((issue) => ISSUE_META[issue].severity === "warning")
	return {
		score: Math.max(0, Math.min(100, score)),
		issues,
		blockers,
		warnings,
	}
}

export function buildTourQualityActions(
	productId: string,
	issues: TourQualityIssue[]
): TourQualityAction[] {
	return issues.map((issue) => {
		const meta = ISSUE_META[issue]
		return {
			issue,
			severity: meta.severity,
			label: meta.label,
			href: meta.path(productId),
		}
	})
}

/** Publication blockers for evaluate-product-readiness (excludes draft_status warning). */
export function tourPublicationBlockers(input: TourQualityScoreInput): TourQualityIssue[] {
	return scoreTourQuality(input).blockers
}

/**
 * Single source of truth: admin quality blockers → publish readiness validation errors.
 * Warnings (`draft_status`, `no_active_salida`) do not block ready.
 */
export function tourPublicationValidationErrors(
	input: TourQualityScoreInput
): TourPublicationValidationError[] {
	return tourPublicationBlockers(input).flatMap((issue) => {
		if (issue === "draft_status" || issue === "no_active_salida") return []
		const mapped = PUBLICATION_ERROR_BY_BLOCKER[issue]
		return mapped ? [mapped] : []
	})
}

export async function loadTourAdminQualityQueue(params?: {
	limit?: number
	onlyNeedsAttention?: boolean
}): Promise<{
	rows: TourQualityRow[]
	counts: { total: number; needsAttention: number; blocked: number }
}> {
	const limit = Math.max(1, Math.min(Number(params?.limit ?? 50) || 50, 200))
	const onlyNeedsAttention = Boolean(params?.onlyNeedsAttention)

	const products = await db
		.select({
			productId: Product.id,
			name: Product.name,
			providerId: Product.providerId,
			status: Product.publicationState,
			itineraryJson: Tour.itineraryJson,
			meetingPointJson: Tour.meetingPointJson,
			durationMinutes: Tour.durationMinutes,
			includesJson: Tour.includesJson,
		})
		.from(Tour)
		.innerJoin(Product, eq(Product.id, Tour.productId))
		.orderBy(Product.name)
		.limit(limit)

	if (!products.length) {
		return { rows: [], counts: { total: 0, needsAttention: 0, blocked: 0 } }
	}

	const productIds = products.map((row) => row.productId)
	const [imageRows, salidaRows, completeRows, categoryRows, ticketRows] = await Promise.all([
		db
			.select({
				productId: Image.entityId,
				imageCount: count(Image.id),
			})
			.from(Image)
			.where(
				and(inArray(Image.entityId, productIds), inArray(Image.entityType, ["product", "Product"]))
			)
			.groupBy(Image.entityId),
		db
			.select({
				productId: Variant.productId,
				activeSalidaCount: count(Variant.id),
			})
			.from(Variant)
			.where(
				and(
					inArray(Variant.productId, productIds),
					eq(Variant.kind, "tour_slot"),
					eq(Variant.isActive, true)
				)
			)
			.groupBy(Variant.productId),
		db
			.select({
				productId: Variant.productId,
				completeSalidaCount: count(Variant.id),
			})
			.from(Variant)
			.innerJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
			.innerJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.innerJoin(
				RatePlan,
				and(
					eq(RatePlan.variantId, Variant.id),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.where(
				and(
					inArray(Variant.productId, productIds),
					eq(Variant.kind, "tour_slot"),
					eq(Variant.isActive, true)
				)
			)
			.groupBy(Variant.productId),
		db
			.select({
				productId: ProductCategoryLink.productId,
				categoryCount: count(ProductCategoryLink.id),
			})
			.from(ProductCategoryLink)
			.where(inArray(ProductCategoryLink.productId, productIds))
			.groupBy(ProductCategoryLink.productId),
		db
			.select({
				productId: TourTicketType.productId,
				activeTicketCount: count(TourTicketType.id),
			})
			.from(TourTicketType)
			.where(and(inArray(TourTicketType.productId, productIds), eq(TourTicketType.isActive, true)))
			.groupBy(TourTicketType.productId),
	])

	const imagesByProduct = new Map(
		imageRows.map((row) => [String(row.productId), Number(row.imageCount ?? 0)])
	)
	const salidasByProduct = new Map(
		salidaRows.map((row) => [String(row.productId), Number(row.activeSalidaCount ?? 0)])
	)
	const completeByProduct = new Map(
		completeRows.map((row) => [String(row.productId), Number(row.completeSalidaCount ?? 0)])
	)
	const categoriesByProduct = new Map(
		categoryRows.map((row) => [String(row.productId), Number(row.categoryCount ?? 0)])
	)
	const ticketsByProduct = new Map(
		ticketRows.map((row) => [String(row.productId), Number(row.activeTicketCount ?? 0)])
	)

	const rows: TourQualityRow[] = products.map((row) => {
		const itinerarySteps = asArray(row.itineraryJson).length
		const imageCount = imagesByProduct.get(row.productId) ?? 0
		const activeSalidaCount = salidasByProduct.get(row.productId) ?? 0
		const completeSalidaCount = completeByProduct.get(row.productId) ?? 0
		const categoryCount = categoriesByProduct.get(row.productId) ?? 0
		const activeTicketCount = ticketsByProduct.get(row.productId) ?? 0
		const scored = scoreTourQuality({
			status: row.status,
			imageCount,
			itinerarySteps,
			hasMeetingPoint: tourHasMeetingPoint(row.meetingPointJson),
			hasDurationMinutes: row.durationMinutes != null && Number(row.durationMinutes) > 0,
			hasIncludes: asArray(row.includesJson).length > 0,
			categoryCount,
			activeTicketCount,
			activeSalidaCount,
			completeSalidaCount,
		})
		return {
			productId: row.productId,
			name: row.name,
			providerId: row.providerId ?? null,
			status: String(row.status ?? "draft"),
			imageCount,
			itinerarySteps,
			hasMeetingPoint: tourHasMeetingPoint(row.meetingPointJson),
			hasDurationMinutes: row.durationMinutes != null && Number(row.durationMinutes) > 0,
			hasIncludes: asArray(row.includesJson).length > 0,
			categoryCount,
			activeTicketCount,
			activeSalidaCount,
			completeSalidaCount,
			score: scored.score,
			issues: scored.issues,
			blockers: scored.blockers,
			warnings: scored.warnings,
			actions: buildTourQualityActions(row.productId, scored.issues),
			reviewHref: `/admin/product-review/${row.productId}`,
		}
	})

	rows.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
	const needsAttention = rows.filter((row) => row.issues.length > 0)
	const blocked = rows.filter((row) => row.blockers.length > 0)
	const filtered = onlyNeedsAttention ? needsAttention : rows

	return {
		rows: filtered,
		counts: {
			total: rows.length,
			needsAttention: needsAttention.length,
			blocked: blocked.length,
		},
	}
}
