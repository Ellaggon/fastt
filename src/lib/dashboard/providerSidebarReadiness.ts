import {
	and,
	DailyInventory,
	db,
	eq,
	inArray,
	PriceRule,
	Product,
	RatePlan,
	RatePlanOccupancyPolicy,
	Restriction,
	sql,
	Variant,
} from "astro:db"
import type { SidebarDisclosureMode } from "@/lib/backoffice-governance"
import { routes } from "@/lib/routes"
import { getProviderPolicyReadiness } from "@/lib/policies/providerPolicyReadiness"

export type ProviderSidebarReadiness = Partial<Record<string, string>>

export type ProviderSidebarData = {
	disclosureMode: SidebarDisclosureMode
	summaries: ProviderSidebarReadiness
}

type ProviderSidebarMetrics = {
	ratePlanIds: string[]
	variantIds: string[]
	activePriceRules: number
	activeRestrictions: number
}

const SCALED_PROVIDER_MIN_RATE_PLANS = 10
const SCALED_PROVIDER_MIN_VARIANTS = 8
const SCALED_PROVIDER_MIN_PRICE_RULES = 5
const SCALED_PROVIDER_MIN_RESTRICTIONS = 5

function plural(value: number, singular: string, pluralLabel: string = `${singular}s`) {
	return `${value} ${value === 1 ? singular : pluralLabel}`
}

function addDays(dateOnly: string, days: number): string {
	const date = new Date(`${dateOnly}T00:00:00.000Z`)
	if (Number.isNaN(date.getTime())) return dateOnly
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

async function getProviderRatePlanIds(providerId: string): Promise<string[]> {
	const rows = await db
		.select({ ratePlanId: RatePlan.id })
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(
			and(
				eq(Product.providerId, providerId),
				eq(Variant.isActive, true),
				eq(RatePlan.isActive, true)
			)
		)
		.all()
	return rows.map((row) => String(row.ratePlanId))
}

async function getProviderVariantIds(providerId: string): Promise<string[]> {
	const rows = await db
		.select({ variantId: Variant.id })
		.from(Variant)
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(and(eq(Product.providerId, providerId), eq(Variant.isActive, true)))
		.all()
	return rows.map((row) => String(row.variantId))
}

async function getRatesSummary(ratePlanIds: string[]) {
	if (!ratePlanIds.length) return "0 tarifas: crea tarifas antes de vender."

	const baseRows = await db
		.select({
			ratePlanId: RatePlanOccupancyPolicy.ratePlanId,
			baseAmount: RatePlanOccupancyPolicy.baseAmount,
		})
		.from(RatePlanOccupancyPolicy)
		.where(inArray(RatePlanOccupancyPolicy.ratePlanId, ratePlanIds))
		.all()
	const pricedRatePlanIds = new Set(
		baseRows.filter((row) => Number(row.baseAmount ?? 0) > 0).map((row) => String(row.ratePlanId))
	)
	const missingBasePrice = ratePlanIds.filter(
		(ratePlanId) => !pricedRatePlanIds.has(ratePlanId)
	).length
	if (missingBasePrice > 0) {
		return `${plural(missingBasePrice, "tarifa")} sin precio base.`
	}

	const activeRules = Number(
		(
			await db
				.select({ value: sql<number>`count(*)` })
				.from(PriceRule)
				.where(inArray(PriceRule.ratePlanId, ratePlanIds))
				.get()
		)?.value ?? 0
	)
	return `${plural(ratePlanIds.length, "tarifa")} con precio base · ${plural(activeRules, "regla")} de precio.`
}

async function getPricingCalendarSummary(ratePlanIds: string[]) {
	if (!ratePlanIds.length) return "Sin tarifas para calendarizar precios."
	const baseRows = await db
		.select({
			ratePlanId: RatePlanOccupancyPolicy.ratePlanId,
			baseAmount: RatePlanOccupancyPolicy.baseAmount,
		})
		.from(RatePlanOccupancyPolicy)
		.where(inArray(RatePlanOccupancyPolicy.ratePlanId, ratePlanIds))
		.all()
	const pricedRatePlanIds = new Set(
		baseRows.filter((row) => Number(row.baseAmount ?? 0) > 0).map((row) => String(row.ratePlanId))
	)
	const ready = pricedRatePlanIds.size
	const missing = Math.max(ratePlanIds.length - ready, 0)
	if (missing > 0)
		return `${plural(ready, "tarifa")} listas, ${plural(missing, "tarifa")} sin precio base.`
	return `${plural(ready, "tarifa")} listas para calendario de precios.`
}

async function getInventorySummary(providerId: string, variantIds: string[]) {
	if (!variantIds.length) return "0 habitaciones activas: crea habitaciones para vender."

	const today = new Date().toISOString().slice(0, 10)
	const nextWeek = addDays(today, 7)
	const rows = await db
		.select({
			variantId: DailyInventory.variantId,
			days: sql<number>`count(*)`,
			blockedDays: sql<number>`sum(case when ${DailyInventory.totalInventory} <= 0 then 1 else 0 end)`,
		})
		.from(DailyInventory)
		.innerJoin(Variant, eq(Variant.id, DailyInventory.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(
			and(
				eq(Product.providerId, providerId),
				inArray(DailyInventory.variantId, variantIds),
				sql`${DailyInventory.date} >= ${today}`,
				sql`${DailyInventory.date} < ${nextWeek}`
			)
		)
		.groupBy(DailyInventory.variantId)
		.all()

	const byVariant = new Map(rows.map((row) => [String(row.variantId), row]))
	const variantsWithGaps = variantIds.filter((variantId) => {
		const row = byVariant.get(variantId)
		return !row || Number(row.days ?? 0) < 7 || Number(row.blockedDays ?? 0) > 0
	}).length
	if (variantsWithGaps > 0) {
		return `${plural(variantsWithGaps, "habitación", "habitaciones")} con brechas esta semana.`
	}
	return `${plural(variantIds.length, "habitación", "habitaciones")} con inventario esta semana.`
}

async function getRestrictionsSummary(
	providerId: string,
	ratePlanIds: string[],
	variantIds: string[]
) {
	const productRows = await db
		.select({ productId: Product.id })
		.from(Product)
		.where(eq(Product.providerId, providerId))
		.all()
	const scopeIds = [
		...ratePlanIds,
		...variantIds,
		...productRows.map((row) => String(row.productId)),
	].filter(Boolean)
	if (!scopeIds.length) return "Sin alcances activos para restricciones."

	const activeRestrictions = Number(
		(
			await db
				.select({ value: sql<number>`count(*)` })
				.from(Restriction)
				.where(and(inArray(Restriction.scopeId, scopeIds), eq(Restriction.isActive, true)))
				.get()
		)?.value ?? 0
	)
	if (activeRestrictions === 0) return "Sin restricciones activas: venta abierta por defecto."
	return `${plural(activeRestrictions, "restricción", "restricciones")} activas en tarifas, habitaciones u hotel.`
}

function resolveDisclosureMode(metrics: ProviderSidebarMetrics): SidebarDisclosureMode {
	if (
		metrics.ratePlanIds.length >= SCALED_PROVIDER_MIN_RATE_PLANS ||
		metrics.variantIds.length >= SCALED_PROVIDER_MIN_VARIANTS ||
		metrics.activePriceRules >= SCALED_PROVIDER_MIN_PRICE_RULES ||
		metrics.activeRestrictions >= SCALED_PROVIDER_MIN_RESTRICTIONS
	) {
		return "scaled-provider"
	}
	return "small-provider"
}

async function countActivePriceRules(ratePlanIds: string[]): Promise<number> {
	if (!ratePlanIds.length) return 0
	return Number(
		(
			await db
				.select({ value: sql<number>`count(*)` })
				.from(PriceRule)
				.where(inArray(PriceRule.ratePlanId, ratePlanIds))
				.get()
		)?.value ?? 0
	)
}

async function countActiveRestrictions(scopeIds: string[]): Promise<number> {
	if (!scopeIds.length) return 0
	return Number(
		(
			await db
				.select({ value: sql<number>`count(*)` })
				.from(Restriction)
				.where(and(inArray(Restriction.scopeId, scopeIds), eq(Restriction.isActive, true)))
				.get()
		)?.value ?? 0
	)
}

export async function getProviderSidebarData(providerId: string): Promise<ProviderSidebarData> {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) return { disclosureMode: "small-provider", summaries: {} }

	const [ratePlanIds, variantIds, productRows, policyReadiness] = await Promise.all([
		getProviderRatePlanIds(normalizedProviderId),
		getProviderVariantIds(normalizedProviderId),
		db
			.select({ productId: Product.id })
			.from(Product)
			.where(eq(Product.providerId, normalizedProviderId))
			.all(),
		getProviderPolicyReadiness(normalizedProviderId),
	])
	const scopeIds = [
		...ratePlanIds,
		...variantIds,
		...productRows.map((row) => String(row.productId)),
	].filter(Boolean)
	const [activePriceRules, activeRestrictions] = await Promise.all([
		countActivePriceRules(ratePlanIds),
		countActiveRestrictions(scopeIds),
	])

	const [ratesSummary, pricingSummary, inventorySummary, restrictionsSummary] = await Promise.all([
		getRatesSummary(ratePlanIds),
		getPricingCalendarSummary(ratePlanIds),
		getInventorySummary(normalizedProviderId, variantIds),
		getRestrictionsSummary(normalizedProviderId, ratePlanIds, variantIds),
	])

	return {
		disclosureMode: resolveDisclosureMode({
			ratePlanIds,
			variantIds,
			activePriceRules,
			activeRestrictions,
		}),
		summaries: {
			[routes.ratePlansList()]: ratesSummary,
			[routes.pricing()]: pricingSummary,
			[routes.inventory()]: inventorySummary,
			[routes.rateRestrictions()]: restrictionsSummary,
			[routes.providerPolicies()]: policyReadiness.summary,
		},
	}
}
