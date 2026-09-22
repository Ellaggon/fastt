import { requireProvider } from "@/lib/auth/requireProvider"
import {
	resolveRatePlanDescriptionColumn,
	resolveRatePlanNameColumn,
} from "@/lib/rates/ratePlanSchemaCompat"
import { and, db, eq, first, Product, RatePlan, Variant } from "@/shared/infrastructure/db/compat"
import type { ServerTimingRecorder } from "@/lib/observability/serverTiming"
import {
	buildProviderRatePlansSurface,
	type RatePlanListItem,
} from "@/lib/rates/providerRatePlansSurface"
import { resolvePolicyDateRange } from "@/modules/policies/public"

export type { RatePlanListItem } from "@/lib/rates/providerRatePlansSurface"

type ProviderRatePlansReadInput = {
	providerId: string
	url?: URL
	checkIn?: string
	checkOut?: string
	timing?: ServerTimingRecorder
}

export async function loadProviderRatePlansReadModel(
	input: ProviderRatePlansReadInput
): Promise<RatePlanListItem[]> {
	const providerId = String(input.providerId ?? "").trim()
	if (!providerId) throw new Error("Provider id is required")
	const range =
		input.checkIn && input.checkOut
			? { checkIn: input.checkIn, checkOut: input.checkOut }
			: resolvePolicyDateRange(input.url ?? new URL("http://fastt.local/rates/plans"))
	const surface = await buildProviderRatePlansSurface({
		providerId,
		checkIn: range.checkIn,
		checkOut: range.checkOut,
		timing: input.timing,
	})
	return surface.ratePlans
}

/**
 * Compatibility adapter for legacy callers. New SSR and API paths should resolve
 * provider ownership once and call loadProviderRatePlansReadModel directly.
 */
export async function loadRatePlansReadModel(input: {
	providerId?: string
	request?: Request
	url?: URL
	checkIn?: string
	checkOut?: string
	channel?: string
	timing?: ServerTimingRecorder
}): Promise<RatePlanListItem[]> {
	let providerId = String(input.providerId ?? "").trim()
	if (!providerId) {
		if (!input.request) throw new Error("Provider id or request is required")
		providerId = (await requireProvider(input.request)).providerId
	}
	return loadProviderRatePlansReadModel({
		providerId,
		url: input.url ?? (input.request ? new URL(input.request.url) : undefined),
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		timing: input.timing,
	})
}

export async function loadRatePlanReadModelById(input: {
	providerId?: string
	request?: Request
	url?: URL
	ratePlanId: string
	checkIn?: string
	checkOut?: string
	channel?: string
}): Promise<RatePlanListItem | null> {
	const ratePlanId = String(input.ratePlanId ?? "").trim()
	if (!ratePlanId) return null
	const rows = await loadRatePlansReadModel(input)
	return rows.find((row) => String(row.ratePlanId) === ratePlanId) ?? null
}

/**
 * The guided rate-plan flow only needs the selected plan's identity. Loading the
 * provider-wide workspace surface here used to calculate pricing and inventory
 * readiness for every plan before the conditions editor could render.
 */
export async function loadRatePlanPlaybookReadModel(input: {
	providerId: string
	ratePlanId: string
}): Promise<RatePlanListItem | null> {
	const providerId = String(input.providerId ?? "").trim()
	const ratePlanId = String(input.ratePlanId ?? "").trim()
	if (!providerId || !ratePlanId) return null

	const [ratePlanName, ratePlanDescription] = await Promise.all([
		resolveRatePlanNameColumn(),
		resolveRatePlanDescriptionColumn(),
	])
	const row = first(
		await db
			.select({
				ratePlanId: RatePlan.id,
				variantId: Variant.id,
				variantName: Variant.name,
				productId: Product.id,
				productName: Product.name,
				productType: Product.productType,
				ratePlanName,
				description: ratePlanDescription,
				isActive: RatePlan.isActive,
				isDefault: RatePlan.isDefault,
			})
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(RatePlan.id, ratePlanId), eq(Product.providerId, providerId)))
	)
	if (!row) return null

	return {
		...row,
		status: row.isActive ? "active" : "inactive",
		summary: { priceRulesCount: 0, activeRestrictionsCount: 0 },
		pricingReadiness: {
			hasBasePrice: false,
			basePrice: null,
			currency: null,
			effectivePricingDays: 0,
		},
		inventoryReadiness: {
			isReady: false,
			coverageDays: 0,
			availableDays: 0,
			expectedDays: 0,
		},
		policyCoverage: {
			totalCategories: 4,
			coveredCategories: 0,
			missingCategories: [],
			isComplete: false,
		},
		policySummary: "",
	}
}
