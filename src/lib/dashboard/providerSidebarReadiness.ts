import {
	first,
	and,
	db,
	eq,
	inArray,
	Product,
	ProviderUser,
	RatePlan,
	RatePlanOccupancyPolicy,
	Variant,
} from "@/shared/infrastructure/db/compat"
import type { SidebarDisclosureMode } from "@/lib/backoffice-governance"
import {
	listCommercialPriceRulesByRatePlans,
	listCommercialSellabilityRulesForScopes,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
import { routes } from "@/lib/routes"
import { getProviderPolicyReadiness } from "@/lib/policies/providerPolicyReadiness"
import { getProviderUserWorkspacePreferenceRead } from "@/lib/providerUserWorkspacePreference"
import type { WorkspaceExperience } from "@/lib/providerUserWorkspacePreference"
import {
	resolveProviderWorkspaceCapabilities,
	resolveWorkspaceExperience,
	type ProviderWorkspaceCapabilities,
	type WorkspaceExperienceResolution,
	WORKSPACE_CAPABILITY_THRESHOLDS,
} from "@/lib/workspace/providerWorkspaceCapabilities"
import {
	normalizeProductVertical,
	type ProductVertical,
} from "@/lib/catalog/productVerticalRegistry"

export type ProviderSidebarReadiness = Partial<Record<string, string>>

export type ProviderSidebarData = {
	disclosureMode: SidebarDisclosureMode
	capabilities: ProviderWorkspaceCapabilities
	experience: WorkspaceExperienceResolution
	summaries: ProviderSidebarReadiness
	productTypes: string[]
	primaryAccommodationHref?: string | null
	primaryAccommodationRoomsHref?: string | null
	primaryAccommodationHouseRulesHref?: string | null
	accommodationCount?: number
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
	workspaceExperience?: WorkspaceExperience
}

export const SIDEBAR_DISCLOSURE_THRESHOLDS = WORKSPACE_CAPABILITY_THRESHOLDS
const EMPTY_WORKSPACE_CAPABILITIES = resolveProviderWorkspaceCapabilities({
	ratePlanCount: 0,
	variantCount: 0,
	activePriceRuleCount: 0,
	activeRestrictionCount: 0,
})

const ADVANCED_PROVIDER_ROLES = new Set(["admin", "revenue_ops", "operations_manager"])

function canonicalProductTypes(rows: Array<{ productType: unknown }>): string[] {
	return [
		...new Set(
			rows
				.map((row) => normalizeProductVertical(row.productType))
				.filter((productType): productType is ProductVertical => productType !== null)
		),
	]
}

function plural(value: number, singular: string, pluralLabel: string = `${singular}s`) {
	return `${value} ${value === 1 ? singular : pluralLabel}`
}

function compactContractCount(value: number) {
	return `${value} ${value === 1 ? "contrato incompleto" : "contratos incompletos"}`
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

	return rows.map((row) => String(row.ratePlanId))
}

async function getProviderVariantIds(providerId: string): Promise<string[]> {
	const rows = await db
		.select({ variantId: Variant.id })
		.from(Variant)
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(and(eq(Product.providerId, providerId), eq(Variant.isActive, true)))

	return rows.map((row) => String(row.variantId))
}

async function getPrimaryAccommodationLinks(providerId: string): Promise<{
	href: string | null
	roomsHref: string | null
	houseRulesHref: string | null
	count: number
}> {
	const rows = await db
		.select({
			productId: Product.id,
			productType: Product.productType,
			variantId: Variant.id,
		})
		.from(Product)
		.leftJoin(Variant, eq(Variant.productId, Product.id))
		.where(eq(Product.providerId, providerId))

	const products = new Map<string, { id: string; roomCount: number }>()
	for (const row of rows) {
		const productType = String(row.productType ?? "")
			.trim()
			.toLowerCase()
		if (productType !== "hotel") continue

		const productId = String(row.productId ?? "").trim()
		if (!productId) continue

		const product = products.get(productId) ?? { id: productId, roomCount: 0 }
		if (row.variantId) product.roomCount += 1
		products.set(productId, product)
	}

	const primary = Array.from(products.values()).sort((a, b) => {
		if (b.roomCount !== a.roomCount) return b.roomCount - a.roomCount
		return a.id.localeCompare(b.id)
	})[0]

	return primary
		? {
				href: routes.productDetail(primary.id),
				roomsHref: routes.productRoomsForProduct(primary.id),
				houseRulesHref:
					products.size === 1
						? `${routes.providerHouseRules()}?productId=${encodeURIComponent(primary.id)}`
						: routes.providerHouseRules(),
				count: products.size,
			}
		: { href: null, roomsHref: null, houseRulesHref: null, count: 0 }
}

async function getRatesSummary(
	ratePlanIds: string[],
	policyReadiness: Awaited<ReturnType<typeof getProviderPolicyReadiness>>
) {
	if (!ratePlanIds.length) return "0 tarifas · crea la primera"

	const baseRows = await db
		.select({
			ratePlanId: RatePlanOccupancyPolicy.ratePlanId,
			baseAmount: RatePlanOccupancyPolicy.baseAmount,
		})
		.from(RatePlanOccupancyPolicy)
		.where(inArray(RatePlanOccupancyPolicy.ratePlanId, ratePlanIds))

	const pricedRatePlanIds = new Set(
		baseRows.filter((row) => Number(row.baseAmount ?? 0) > 0).map((row) => String(row.ratePlanId))
	)
	const missingBasePrice = ratePlanIds.filter(
		(ratePlanId) => !pricedRatePlanIds.has(ratePlanId)
	).length
	if (missingBasePrice > 0) {
		return `${missingBasePrice} sin precio · ${compactContractCount(policyReadiness.incompleteRatePlans)}`
	}

	const activeRules = (await listCommercialPriceRulesByRatePlans(ratePlanIds)).filter(
		(rule) => rule.isActive
	).length
	if (policyReadiness.incompleteRatePlans > 0) {
		return `${plural(ratePlanIds.length, "tarifa")} con precio · ${compactContractCount(policyReadiness.incompleteRatePlans)}`
	}
	return `${plural(ratePlanIds.length, "tarifa")} listas · ${plural(activeRules, "regla")} de precio`
}

async function getPricingCalendarSummary(ratePlanIds: string[]) {
	if (!ratePlanIds.length) return "0 tarifas · crea la primera"
	const baseRows = await db
		.select({
			ratePlanId: RatePlanOccupancyPolicy.ratePlanId,
			baseAmount: RatePlanOccupancyPolicy.baseAmount,
		})
		.from(RatePlanOccupancyPolicy)
		.where(inArray(RatePlanOccupancyPolicy.ratePlanId, ratePlanIds))

	const pricedRatePlanIds = new Set(
		baseRows.filter((row) => Number(row.baseAmount ?? 0) > 0).map((row) => String(row.ratePlanId))
	)
	const ready = pricedRatePlanIds.size
	const missing = Math.max(ratePlanIds.length - ready, 0)
	if (missing > 0) {
		return `${plural(ready, "tarifa lista", "tarifas listas")} · ${plural(missing, "requiere", "requieren")} atención`
	}
	return plural(ready, "tarifa lista", "tarifas listas")
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

	const scopeIds = [
		...ratePlanIds,
		...variantIds,
		...productRows.map((row) => String(row.productId)),
	].filter(Boolean)
	if (!scopeIds.length) return "sin reglas activas"

	const activeRestrictions = (await listCommercialSellabilityRulesForScopes({ scopeIds })).filter(
		(rule) => rule.isActive
	).length
	if (activeRestrictions === 0) return "sin reglas activas"
	return plural(activeRestrictions, "regla activa", "reglas activas")
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
	const capabilities = resolveProviderWorkspaceCapabilities({
		ratePlanCount: metrics.ratePlanIds.length,
		variantCount: metrics.variantIds.length,
		activePriceRuleCount: metrics.activePriceRules,
		activeRestrictionCount: metrics.activeRestrictions,
	})
	const experience = resolveWorkspaceExperience({
		preference: context.workspaceExperience ?? "essential",
		providerRole: role,
		capabilities,
	})
	if (experience.source === "enterprise-scale") return "scaled-provider"
	if (ADVANCED_PROVIDER_ROLES.has(role) || experience.effective === "professional") {
		return "professional-tools"
	}
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
		.then(first)
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
	if (!normalizedProviderId)
		return {
			disclosureMode: "small-provider",
			capabilities: EMPTY_WORKSPACE_CAPABILITIES,
			experience: resolveWorkspaceExperience({
				preference: "essential",
				capabilities: EMPTY_WORKSPACE_CAPABILITIES,
			}),
			summaries: {},
			productTypes: [],
			primaryAccommodationHref: null,
			primaryAccommodationRoomsHref: null,
			primaryAccommodationHouseRulesHref: null,
			accommodationCount: 0,
		}

	const [resolvedRole, workspacePreference] = await Promise.all([
		context.providerRole
			? Promise.resolve(normalizeProviderRole(context.providerRole))
			: getProviderUserRole(normalizedProviderId, context.userId),
		context.workspaceExperience
			? Promise.resolve(null)
			: context.userId
				? getProviderUserWorkspacePreferenceRead({
						providerId: normalizedProviderId,
						userId: context.userId,
					})
				: Promise.resolve(null),
	])
	const effectiveContext: ProviderAdvancedDisclosureContext = {
		...context,
		providerRole: normalizeProviderRole(resolvedRole) || "provider-role-none",
		workspaceExperience:
			context.workspaceExperience ??
			(workspacePreference?.schemaAvailable ? workspacePreference.experience : "essential"),
	}
	const cacheKey = cacheKeys.providerSidebar(
		normalizedProviderId,
		String(context.userId ?? "anonymous"),
		effectiveContext.workspaceExperience ?? "essential",
		String(effectiveContext.providerRole)
	)
	return readThrough(cacheKey, cacheTtls.providerSidebar, async () =>
		loadProviderSidebarData(normalizedProviderId, effectiveContext)
	)
}

/**
 * Keeps the navigation useful when an optional readiness metric fails. Product
 * scope is essential navigation context; pricing summaries are not.
 */
export async function getProviderSidebarFallbackData(
	providerId: string,
	context: ProviderAdvancedDisclosureContext = {}
): Promise<ProviderSidebarData> {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) {
		return {
			disclosureMode: "small-provider",
			capabilities: EMPTY_WORKSPACE_CAPABILITIES,
			experience: resolveWorkspaceExperience({
				preference: context.workspaceExperience ?? "essential",
				providerRole: context.providerRole,
				capabilities: EMPTY_WORKSPACE_CAPABILITIES,
			}),
			summaries: {},
			productTypes: [],
			primaryAccommodationHref: null,
			primaryAccommodationRoomsHref: null,
			primaryAccommodationHouseRulesHref: null,
			accommodationCount: 0,
		}
	}

	const [productRows, primaryAccommodationLinks] = await Promise.all([
		db
			.select({ productType: Product.productType })
			.from(Product)
			.where(eq(Product.providerId, normalizedProviderId)),
		getPrimaryAccommodationLinks(normalizedProviderId),
	])
	const productTypes = canonicalProductTypes(productRows)
	const experience = resolveWorkspaceExperience({
		preference: context.workspaceExperience ?? "essential",
		providerRole: context.providerRole,
		capabilities: EMPTY_WORKSPACE_CAPABILITIES,
	})

	return {
		disclosureMode:
			experience.effective === "professional" ? "professional-tools" : "small-provider",
		capabilities: EMPTY_WORKSPACE_CAPABILITIES,
		experience,
		summaries: {},
		productTypes,
		primaryAccommodationHref: primaryAccommodationLinks.href,
		primaryAccommodationRoomsHref: primaryAccommodationLinks.roomsHref,
		primaryAccommodationHouseRulesHref: primaryAccommodationLinks.houseRulesHref,
		accommodationCount: primaryAccommodationLinks.count,
	}
}

async function loadProviderSidebarData(
	normalizedProviderId: string,
	context: ProviderAdvancedDisclosureContext
): Promise<ProviderSidebarData> {
	const [ratePlanIds, variantIds, productRows, policyReadiness, primaryAccommodationLinks] =
		await Promise.all([
			getProviderRatePlanIds(normalizedProviderId),
			getProviderVariantIds(normalizedProviderId),
			db
				.select({ productId: Product.id, productType: Product.productType })
				.from(Product)
				.where(eq(Product.providerId, normalizedProviderId)),
			getProviderPolicyReadiness(normalizedProviderId),
			getPrimaryAccommodationLinks(normalizedProviderId),
		])
	const scopeIds = [
		...ratePlanIds,
		...variantIds,
		...productRows.map((row) => String(row.productId)),
	].filter(Boolean)
	const productTypes = canonicalProductTypes(productRows)
	const [activePriceRules, activeRestrictions] = await Promise.all([
		countActivePriceRules(ratePlanIds),
		countActiveRestrictions(scopeIds),
	])
	const capabilities = resolveProviderWorkspaceCapabilities({
		ratePlanCount: ratePlanIds.length,
		variantCount: variantIds.length,
		activePriceRuleCount: activePriceRules,
		activeRestrictionCount: activeRestrictions,
	})
	const experience = resolveWorkspaceExperience({
		preference: context.workspaceExperience ?? "essential",
		providerRole: context.providerRole,
		capabilities,
	})

	const [ratesSummary, pricingSummary, restrictionsSummary] = await Promise.all([
		getRatesSummary(ratePlanIds, policyReadiness),
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
				providerRole: context.providerRole,
				workspaceExperience: experience.preference,
				userId: context.userId,
			}
		),
		capabilities,
		experience,
		summaries: {
			[routes.ratePlansList()]: ratesSummary,
			[routes.calendar()]: pricingSummary,
			[routes.ratesMultiCalendar()]: `${plural(ratePlanIds.length, "tarifa")} · ${restrictionsSummary}`,
		},
		productTypes,
		primaryAccommodationHref: primaryAccommodationLinks.href,
		primaryAccommodationRoomsHref: primaryAccommodationLinks.roomsHref,
		primaryAccommodationHouseRulesHref: primaryAccommodationLinks.houseRulesHref,
		accommodationCount: primaryAccommodationLinks.count,
	}
}
