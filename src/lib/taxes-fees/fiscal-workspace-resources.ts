import { variantManagementRepository } from "@/container"
import { getAggregateCache, setAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { listRatePlansByProvider } from "@/modules/pricing/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import {
	and,
	db,
	eq,
	EffectivePricingV2,
	gte,
	inArray,
	lt,
	Product,
	SearchUnitView,
} from "@/shared/infrastructure/db/compat"

export type FiscalWorkspaceResources = {
	providerId: string
	products: Array<{ id: string; label: string; kind: string }>
	variants: Array<{ id: string; productId: string; label: string; kind: string }>
	ratePlans: Array<{
		id: string
		productId: string
		variantId: string
		label: string
		isActive: boolean
	}>
}

export type FiscalSimulationContext = {
	productId: string
	productLabel: string
	variantId: string
	variantLabel: string
	ratePlanId: string
	ratePlanLabel: string
	channel: "web"
	checkIn: string
	checkOut: string
	rooms: number
	adults: number
	children: number
	currency: string
	baseAmount: number
	pricingSource: "effective_pricing_v2" | "materialized_search_view"
}

type SimulationPricing = Pick<
	FiscalSimulationContext,
	"currency" | "baseAmount" | "pricingSource"
> & {
	days: Array<{ date: string; price: number }>
}

function dayString(date: Date) {
	return date.toISOString().slice(0, 10)
}

function normalizedDay(value: Date | string) {
	return value instanceof Date ? dayString(value) : String(value).slice(0, 10)
}

function addUtcDays(date: Date, days: number) {
	const result = new Date(date)
	result.setUTCDate(result.getUTCDate() + days)
	return result
}

function nextFriday() {
	const today = new Date()
	const daysUntilFriday = (5 - today.getUTCDay() + 7) % 7 || 7
	return addUtcDays(
		new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
		daysUntilFriday
	)
}

/** Resolves an actual two-night price from the same materialized pricing and availability data used by sales surfaces. */
export async function resolveFiscalSimulationPricing(input: {
	variantId: string
	ratePlanId: string
	checkIn: string
	checkOut: string
	adults?: number
	children?: number
}): Promise<SimulationPricing | null> {
	const occupancyKey = buildOccupancyKey({
		adults: input.adults ?? 2,
		children: input.children ?? 0,
	})
	const [inventoryRows, effectiveRows] = await Promise.all([
		db
			.select({
				date: SearchUnitView.date,
				isAvailable: SearchUnitView.isAvailable,
				hasAvailability: SearchUnitView.hasAvailability,
				hasPrice: SearchUnitView.hasPrice,
				availableUnits: SearchUnitView.availableUnits,
				price: SearchUnitView.pricePerNight,
				primaryBlocker: SearchUnitView.primaryBlocker,
			})
			.from(SearchUnitView)
			.where(
				and(
					eq(SearchUnitView.variantId, input.variantId),
					eq(SearchUnitView.ratePlanId, input.ratePlanId),
					gte(SearchUnitView.date, input.checkIn),
					lt(SearchUnitView.date, input.checkOut)
				)
			)
			.catch(() => []),
		db
			.select({
				date: EffectivePricingV2.date,
				price: EffectivePricingV2.finalBasePrice,
				currency: EffectivePricingV2.currency,
			})
			.from(EffectivePricingV2)
			.where(
				and(
					eq(EffectivePricingV2.variantId, input.variantId),
					eq(EffectivePricingV2.ratePlanId, input.ratePlanId),
					eq(EffectivePricingV2.occupancyKey, occupancyKey),
					gte(EffectivePricingV2.date, input.checkIn),
					lt(EffectivePricingV2.date, input.checkOut)
				)
			)
			.catch(() => []),
	])
	const inventoryByDate = new Map(inventoryRows.map((row) => [normalizedDay(row.date), row]))
	const effectiveByDate = new Map(effectiveRows.map((row) => [normalizedDay(row.date), row]))
	const expectedDays = Math.round(
		(new Date(`${input.checkOut}T00:00:00.000Z`).getTime() -
			new Date(`${input.checkIn}T00:00:00.000Z`).getTime()) /
			86400000
	)
	if (expectedDays < 1) return null
	const days: Array<{ date: string; price: number }> = []
	let effective = true
	for (let index = 0; index < expectedDays; index += 1) {
		const date = dayString(addUtcDays(new Date(`${input.checkIn}T00:00:00.000Z`), index))
		const inventory = inventoryByDate.get(date)
		if (
			!inventory ||
			!inventory.isAvailable ||
			!inventory.hasAvailability ||
			!inventory.hasPrice ||
			Number(inventory.availableUnits ?? 0) < 1 ||
			String(inventory.primaryBlocker ?? "").trim()
		)
			return null
		const effectivePrice = effectiveByDate.get(date)
		const price = Number(effectivePrice?.price ?? inventory.price ?? 0)
		if (!Number.isFinite(price) || price <= 0) return null
		if (!effectivePrice) effective = false
		days.push({ date, price: Number(price.toFixed(2)) })
	}
	return {
		days,
		baseAmount: Number(days.reduce((total, day) => total + day.price, 0).toFixed(2)),
		currency: String(effectiveRows[0]?.currency ?? "USD"),
		pricingSource: effective ? "effective_pricing_v2" : "materialized_search_view",
	}
}

/** Chooses the first genuinely sellable Friday-to-Sunday context, preferring the current product scope. */
export async function getRecommendedFiscalSimulationContext(input: {
	resources: FiscalWorkspaceResources
	preferredProductId?: string | null
}): Promise<FiscalSimulationContext | null> {
	const start = nextFriday()
	const windowEnd = dayString(addUtcDays(start, 32))
	const productRank = (productId: string) => (productId === input.preferredProductId ? 0 : 1)
	const candidates = input.resources.ratePlans
		.filter((plan) => plan.isActive && Boolean(plan.variantId))
		.sort((left, right) => productRank(left.productId) - productRank(right.productId))
		.slice(0, 24)
	const candidateIds = candidates.map((plan) => plan.id)
	if (!candidateIds.length) return null
	const occupancyKey = buildOccupancyKey({ adults: 2, children: 0 })
	const [inventoryRows, effectiveRows] = await Promise.all([
		db
			.select({
				ratePlanId: SearchUnitView.ratePlanId,
				date: SearchUnitView.date,
				isAvailable: SearchUnitView.isAvailable,
				hasAvailability: SearchUnitView.hasAvailability,
				hasPrice: SearchUnitView.hasPrice,
				availableUnits: SearchUnitView.availableUnits,
				price: SearchUnitView.pricePerNight,
				primaryBlocker: SearchUnitView.primaryBlocker,
			})
			.from(SearchUnitView)
			.where(
				and(
					inArray(SearchUnitView.ratePlanId, candidateIds),
					gte(SearchUnitView.date, dayString(start)),
					lt(SearchUnitView.date, windowEnd)
				)
			)
			.catch(() => []),
		db
			.select({
				ratePlanId: EffectivePricingV2.ratePlanId,
				date: EffectivePricingV2.date,
				price: EffectivePricingV2.finalBasePrice,
				currency: EffectivePricingV2.currency,
			})
			.from(EffectivePricingV2)
			.where(
				and(
					inArray(EffectivePricingV2.ratePlanId, candidateIds),
					eq(EffectivePricingV2.occupancyKey, occupancyKey),
					gte(EffectivePricingV2.date, dayString(start)),
					lt(EffectivePricingV2.date, windowEnd)
				)
			)
			.catch(() => []),
	])
	const inventoryByPlanAndDate = new Map(
		inventoryRows.map((row) => [`${row.ratePlanId}:${normalizedDay(row.date)}`, row])
	)
	const effectiveByPlanAndDate = new Map(
		effectiveRows.map((row) => [`${row.ratePlanId}:${normalizedDay(row.date)}`, row])
	)
	for (const plan of candidates) {
		const product = input.resources.products.find((item) => item.id === plan.productId)
		const variant = input.resources.variants.find((item) => item.id === plan.variantId)
		if (!product || !variant) continue
		for (let offset = 0; offset < 30; offset += 1) {
			const checkIn = dayString(addUtcDays(start, offset))
			const checkOut = dayString(addUtcDays(start, offset + 2))
			const days = [checkIn, dayString(addUtcDays(start, offset + 1))].map((date) => {
				const inventory = inventoryByPlanAndDate.get(`${plan.id}:${date}`)
				const effective = effectiveByPlanAndDate.get(`${plan.id}:${date}`)
				if (
					!inventory ||
					!inventory.isAvailable ||
					!inventory.hasAvailability ||
					!inventory.hasPrice ||
					Number(inventory.availableUnits ?? 0) < 1 ||
					String(inventory.primaryBlocker ?? "").trim()
				)
					return null
				const price = Number(effective?.price ?? inventory.price ?? 0)
				return Number.isFinite(price) && price > 0
					? { price, currency: String(effective?.currency ?? "USD"), effective: Boolean(effective) }
					: null
			})
			if (days.some((day) => !day)) continue
			const pricedDays = days as Array<{ price: number; currency: string; effective: boolean }>
			return {
				productId: product.id,
				productLabel: product.label,
				variantId: variant.id,
				variantLabel: variant.label,
				ratePlanId: plan.id,
				ratePlanLabel: plan.label,
				channel: "web",
				checkIn,
				checkOut,
				rooms: 1,
				adults: 2,
				children: 0,
				currency: pricedDays[0].currency,
				baseAmount: Number(pricedDays.reduce((total, day) => total + day.price, 0).toFixed(2)),
				pricingSource: pricedDays.every((day) => day.effective)
					? "effective_pricing_v2"
					: "materialized_search_view",
			}
		}
	}
	return null
}

/** Short-lived workspace catalog shared by Definitions and Simulator route transitions. */
export async function getFiscalWorkspaceResources(
	providerId: string
): Promise<FiscalWorkspaceResources> {
	const cacheKey = `fiscal:resources:${providerId}`
	const cached = getAggregateCache<FiscalWorkspaceResources>(cacheKey)
	if (cached) return cached

	const [productRows, ratePlans] = await Promise.all([
		db
			.select({ id: Product.id, name: Product.name, productType: Product.productType })
			.from(Product)
			.where(eq(Product.providerId, providerId))
			.catch(() => []),
		listRatePlansByProvider(providerId).catch(() => []),
	])
	const variantsByProduct = await Promise.all(
		productRows.map(async (product) => ({
			productId: String(product.id),
			variants: await variantManagementRepository
				.listVariantsByProductId(String(product.id))
				.catch(() => []),
		}))
	)
	const resources: FiscalWorkspaceResources = {
		providerId,
		products: productRows.map((product) => ({
			id: String(product.id),
			label: String(product.name || "Producto sin nombre"),
			kind: String(product.productType || "Producto"),
		})),
		variants: variantsByProduct.flatMap(({ productId, variants }) =>
			variants.map((variant) => ({
				id: String(variant.id),
				productId,
				label: String(variant.name || "Unidad sin nombre"),
				kind: String(variant.kind || "Unidad"),
			}))
		),
		ratePlans: (ratePlans as Array<any>).map((ratePlan) => ({
			id: String(ratePlan.ratePlanId),
			productId: String(ratePlan.productId),
			variantId: String(ratePlan.variantId),
			label: String(ratePlan.ratePlanName || "Tarifa sin nombre"),
			isActive: Boolean(ratePlan.isActive),
		})),
	}
	setAggregateCache(cacheKey, resources, {
		ttlMs: 5_000,
		tags: [
			`provider:${providerId}`,
			...resources.products.map((product) => `product:${product.id}`),
			...resources.variants.map((variant) => `variant:${variant.id}`),
		],
	})
	return resources
}
