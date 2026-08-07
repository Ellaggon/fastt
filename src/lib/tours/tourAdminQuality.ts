import {
	and,
	count,
	db,
	eq,
	Image,
	inArray,
	Product,
	ProductStatus,
	Tour,
	Variant,
} from "@/shared/infrastructure/db/compat"

export type TourQualityIssue =
	| "missing_images"
	| "thin_itinerary"
	| "missing_meeting_point"
	| "missing_duration"
	| "missing_includes"
	| "no_active_salida"
	| "draft_status"

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
	activeSalidaCount: number
	score: number
	issues: TourQualityIssue[]
	reviewHref: string
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
}

function hasMeetingPoint(value: unknown): boolean {
	if (!value || typeof value !== "object") return false
	const row = value as Record<string, unknown>
	const label = String(row.label ?? row.name ?? row.address ?? "").trim()
	const lat = Number(row.lat ?? row.latitude)
	const lng = Number(row.lng ?? row.longitude)
	return Boolean(label) || (Number.isFinite(lat) && Number.isFinite(lng))
}

/** Score 0–100; higher is healthier. Issues drive admin triage (Fase 6). */
export function scoreTourQuality(input: {
	status: string | null | undefined
	imageCount: number
	itinerarySteps: number
	hasMeetingPoint: boolean
	hasDurationMinutes: boolean
	hasIncludes: boolean
	activeSalidaCount: number
}): { score: number; issues: TourQualityIssue[] } {
	const issues: TourQualityIssue[] = []
	let score = 100
	const status = String(input.status ?? "draft")
		.trim()
		.toLowerCase()

	if (status !== "published") {
		issues.push("draft_status")
		score -= 10
	}
	if (input.imageCount < 3) {
		issues.push("missing_images")
		score -= input.imageCount === 0 ? 25 : 12
	}
	if (input.itinerarySteps < 2) {
		issues.push("thin_itinerary")
		score -= input.itinerarySteps === 0 ? 25 : 10
	}
	if (!input.hasMeetingPoint) {
		issues.push("missing_meeting_point")
		score -= 15
	}
	if (!input.hasDurationMinutes) {
		issues.push("missing_duration")
		score -= 8
	}
	if (!input.hasIncludes) {
		issues.push("missing_includes")
		score -= 5
	}
	if (input.activeSalidaCount < 1) {
		issues.push("no_active_salida")
		score -= 20
	}

	return { score: Math.max(0, Math.min(100, score)), issues }
}

export async function loadTourAdminQualityQueue(params?: {
	limit?: number
	onlyNeedsAttention?: boolean
}): Promise<{ rows: TourQualityRow[]; counts: { total: number; needsAttention: number } }> {
	const limit = Math.max(1, Math.min(Number(params?.limit ?? 50) || 50, 200))
	const onlyNeedsAttention = Boolean(params?.onlyNeedsAttention)

	const products = await db
		.select({
			productId: Product.id,
			name: Product.name,
			providerId: Product.providerId,
			status: ProductStatus.state,
			itineraryJson: Tour.itineraryJson,
			meetingPointJson: Tour.meetingPointJson,
			durationMinutes: Tour.durationMinutes,
			includesJson: Tour.includesJson,
		})
		.from(Tour)
		.innerJoin(Product, eq(Product.id, Tour.productId))
		.leftJoin(ProductStatus, eq(ProductStatus.productId, Tour.productId))
		.orderBy(Product.name)
		.limit(limit)

	if (!products.length) {
		return { rows: [], counts: { total: 0, needsAttention: 0 } }
	}

	const productIds = products.map((row) => row.productId)
	const [imageRows, salidaRows] = await Promise.all([
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
	])

	const imagesByProduct = new Map(
		imageRows.map((row) => [String(row.productId), Number(row.imageCount ?? 0)])
	)
	const salidasByProduct = new Map(
		salidaRows.map((row) => [String(row.productId), Number(row.activeSalidaCount ?? 0)])
	)

	const rows: TourQualityRow[] = products.map((row) => {
		const itinerarySteps = asArray(row.itineraryJson).length
		const imageCount = imagesByProduct.get(row.productId) ?? 0
		const activeSalidaCount = salidasByProduct.get(row.productId) ?? 0
		const scored = scoreTourQuality({
			status: row.status,
			imageCount,
			itinerarySteps,
			hasMeetingPoint: hasMeetingPoint(row.meetingPointJson),
			hasDurationMinutes: row.durationMinutes != null && Number(row.durationMinutes) > 0,
			hasIncludes: asArray(row.includesJson).length > 0,
			activeSalidaCount,
		})
		return {
			productId: row.productId,
			name: row.name,
			providerId: row.providerId ?? null,
			status: String(row.status ?? "draft"),
			imageCount,
			itinerarySteps,
			hasMeetingPoint: hasMeetingPoint(row.meetingPointJson),
			hasDurationMinutes: row.durationMinutes != null && Number(row.durationMinutes) > 0,
			hasIncludes: asArray(row.includesJson).length > 0,
			activeSalidaCount,
			score: scored.score,
			issues: scored.issues,
			reviewHref: `/admin/product-review/${row.productId}`,
		}
	})

	rows.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
	const needsAttention = rows.filter((row) => row.issues.length > 0)
	const filtered = onlyNeedsAttention ? needsAttention : rows

	return {
		rows: filtered,
		counts: { total: rows.length, needsAttention: needsAttention.length },
	}
}
