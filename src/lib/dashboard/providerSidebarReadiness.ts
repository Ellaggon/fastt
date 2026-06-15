import {
	and,
	db,
	eq,
	inArray,
	Product,
	ProviderUser,
	RatePlan,
	RatePlanOccupancyPolicy,
	Variant,
} from "astro:db"
import type { SidebarDisclosureMode } from "@/lib/backoffice-governance"
import {
	listCommercialPriceRulesByRatePlans,
	listCommercialSellabilityRulesForScopes,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { routes } from "@/lib/routes"
import { getProviderPolicyReadiness } from "@/lib/policies/providerPolicyReadiness"
import { getProviderProfessionalToolsPreferenceRead } from "@/lib/providerProfessionalToolsPreference"

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

type ProviderAdvancedDisclosureContext = {
	userId?: string | null
	providerRole?: string | null
	professionalToolsEnabled?: boolean
}

export const SIDEBAR_DISCLOSURE_THRESHOLDS = {
	ratePlans: 10,
	variants: 8,
	activePriceRules: 5,
	activeRestrictions: 5,
} as const

const ADVANCED_PROVIDER_ROLES = new Set(["admin", "revenue_ops", "operations_manager"])

function plural(value: number, singular: string, pluralLabel: string = `${singular}s`) {
	return `${value} ${value === 1 ? singular : pluralLabel}`
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

	const activeRules = (await listCommercialPriceRulesByRatePlans(ratePlanIds)).filter(
		(rule) => rule.isActive
	).length
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
	if (!scopeIds.length) return "Sin alcances activos para reglas de venta."

	const activeRestrictions = (await listCommercialSellabilityRulesForScopes({ scopeIds })).filter(
		(rule) => rule.isActive
	).length
	if (activeRestrictions === 0) return "Sin reglas de venta activas: venta abierta por defecto."
	return `${plural(activeRestrictions, "regla de venta", "reglas de venta")} activas en tarifas, habitaciones u hotel.`
}

function hasScaleForAdvancedTools(metrics: ProviderSidebarMetrics): boolean {
	return (
		metrics.ratePlanIds.length >= SIDEBAR_DISCLOSURE_THRESHOLDS.ratePlans ||
		metrics.variantIds.length >= SIDEBAR_DISCLOSURE_THRESHOLDS.variants ||
		metrics.activePriceRules >= SIDEBAR_DISCLOSURE_THRESHOLDS.activePriceRules ||
		metrics.activeRestrictions >= SIDEBAR_DISCLOSURE_THRESHOLDS.activeRestrictions
	)
}

function normalizeProviderRole(role: unknown): string {
	return String(role ?? "")
		.trim()
		.toLowerCase()
}

export function resolveDisclosureMode(
	metrics: ProviderSidebarMetrics,
	context: ProviderAdvancedDisclosureContext = {}
): SidebarDisclosureMode {
	const role = normalizeProviderRole(context.providerRole)
	if (role === "internal_admin") return "internal-admin"
	if (role === "revenue_ops") return "revenue-ops"
	if (ADVANCED_PROVIDER_ROLES.has(role)) return "professional-tools"
	if (context.professionalToolsEnabled) return "professional-tools"
	if (hasScaleForAdvancedTools(metrics)) return "scaled-provider"
	return "small-provider"
}

async function getProviderUserRole(
	providerId: string,
	userId?: string | null
): Promise<string | null> {
	if (!providerId || !userId) return null
	const row = await db
		.select({ role: ProviderUser.role })
		.from(ProviderUser)
		.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
		.get()
	return row?.role ? String(row.role) : null
}

async function countActivePriceRules(ratePlanIds: string[]): Promise<number> {
	if (!ratePlanIds.length) return 0
	return (await listCommercialPriceRulesByRatePlans(ratePlanIds)).filter((rule) => rule.isActive)
		.length
}

async function countActiveRestrictions(scopeIds: string[]): Promise<number> {
	if (!scopeIds.length) return 0
	return (await listCommercialSellabilityRulesForScopes({ scopeIds })).filter(
		(rule) => rule.isActive
	).length
}

export async function getProviderSidebarData(
	providerId: string,
	context: ProviderAdvancedDisclosureContext = {}
): Promise<ProviderSidebarData> {
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
	const [activePriceRules, activeRestrictions, providerRole] = await Promise.all([
		countActivePriceRules(ratePlanIds),
		countActiveRestrictions(scopeIds),
		getProviderUserRole(normalizedProviderId, context.userId),
	])
	const professionalToolsPreference =
		await getProviderProfessionalToolsPreferenceRead(normalizedProviderId)
	const professionalToolsEnabled =
		typeof context.professionalToolsEnabled === "boolean"
			? context.professionalToolsEnabled
			: professionalToolsPreference.schemaAvailable
				? professionalToolsPreference.professionalToolsEnabled
				: false

	const [ratesSummary, pricingSummary, restrictionsSummary] = await Promise.all([
		getRatesSummary(ratePlanIds),
		getPricingCalendarSummary(ratePlanIds),
		getRestrictionsSummary(normalizedProviderId, ratePlanIds, variantIds),
	])

	return {
		disclosureMode: resolveDisclosureMode(
			{
				ratePlanIds,
				variantIds,
				activePriceRules,
				activeRestrictions,
			},
			{
				providerRole: context.providerRole ?? providerRole,
				professionalToolsEnabled,
				userId: context.userId,
			}
		),
		summaries: {
			[routes.ratePlansList()]: ratesSummary,
			[routes.pricing()]: pricingSummary,
			[routes.ratesMultiCalendar()]: `${plural(ratePlanIds.length, "tarifa")} disponibles para operación Pro.`,
			[routes.rateRestrictions()]: restrictionsSummary,
			[routes.pricingAutomation()]: `${plural(activePriceRules, "regla")} activas para automatizar cambios.`,
			[routes.providerPolicies()]: policyReadiness.summary,
		},
	}
}
