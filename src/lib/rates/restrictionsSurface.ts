import { db, eq, inArray, Product, RatePlan, Variant } from "astro:db"

import {
	createCommercialSellabilityRule,
	deleteCommercialRule,
	listCommercialSellabilityRulesForScopes,
	setCommercialRuleActive,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { logger } from "@/lib/observability/logger"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"
import {
	computeRestrictionPriority,
	type RecomputeEffectiveRestrictionsResult,
	recomputeEffectiveRestrictionsForScope,
	toExclusiveRestrictionDate,
} from "@/modules/policies/public"

export type RestrictionScope = "product" | "variant" | "rate_plan"
export type SellabilityRuleType =
	| "stop_sell"
	| "min_los"
	| "max_los"
	| "cta"
	| "ctd"
	| "min_lead_time"
	| "max_lead_time"

export type RestrictionSurfaceFilters = {
	productId?: string
	variantId?: string
	ratePlanId?: string
	status?: "active" | "inactive" | "all"
	type?: SellabilityRuleType | "all"
}

export type RestrictionSurfaceRule = {
	id: string
	scope: RestrictionScope
	scopeId: string
	type: SellabilityRuleType
	typeLabel: string
	category: string
	value: number | null
	valueLabel: string
	startDate: string
	endDate: string
	validDays: number[]
	validDaysLabel: string
	isActive: boolean
	priority: number
	createdAt: Date
	targetName: string
	productId: string
	productName: string
	variantId?: string
	variantName?: string
	ratePlanId?: string
	ratePlanName?: string
	impactDays: number
	impactLabel: string
}

export type RestrictionSurfaceOption = {
	id: string
	name: string
	productType?: string
	productId?: string
	productName?: string
	variantId?: string
	variantName?: string
}

export type RestrictionsSurfaceModel = {
	products: RestrictionSurfaceOption[]
	variants: RestrictionSurfaceOption[]
	ratePlans: RestrictionSurfaceOption[]
	rules: RestrictionSurfaceRule[]
	stats: {
		totalRules: number
		activeRules: number
		inactiveRules: number
		ratePlansImpacted: number
		stopSellRules: number
		arrivalDepartureRules: number
		lengthOfStayRules: number
		bookingWindowRules: number
		estimatedBlockedOrConditionedDays: number
	}
	productTypes: string[]
}

export const SELLABILITY_RULES: {
	type: SellabilityRuleType
	label: string
	category: string
	description: string
	requiresValue: boolean
	valueLabel?: string
	defaultValue?: number
}[] = [
	{
		type: "stop_sell",
		label: "Cierre de venta",
		category: "Venta",
		description: "Cierra la venta para las fechas seleccionadas.",
		requiresValue: false,
	},
	{
		type: "min_los",
		label: "Estadía mínima",
		category: "Estadía",
		description: "Exige una cantidad mínima de noches.",
		requiresValue: true,
		valueLabel: "Noches mínimas",
		defaultValue: 2,
	},
	{
		type: "max_los",
		label: "Estadía máxima",
		category: "Estadía",
		description: "Limita la cantidad máxima de noches.",
		requiresValue: true,
		valueLabel: "Noches máximas",
		defaultValue: 7,
	},
	{
		type: "cta",
		label: "Sin llegada",
		category: "Llegada / salida",
		description: "Bloquea llegadas en las fechas seleccionadas.",
		requiresValue: false,
	},
	{
		type: "ctd",
		label: "Sin salida",
		category: "Llegada / salida",
		description: "Bloquea salidas en las fechas seleccionadas.",
		requiresValue: false,
	},
	{
		type: "min_lead_time",
		label: "Anticipación mínima",
		category: "Ventana de reserva",
		description: "Exige reservar con al menos N días de anticipación.",
		requiresValue: true,
		valueLabel: "Días mínimos",
		defaultValue: 1,
	},
	{
		type: "max_lead_time",
		label: "Anticipación máxima",
		category: "Ventana de reserva",
		description: "Evita reservas hechas con demasiada anticipación.",
		requiresValue: true,
		valueLabel: "Días máximos",
		defaultValue: 365,
	},
]

const RULE_BY_TYPE = new Map(SELLABILITY_RULES.map((rule) => [rule.type, rule]))
const VALID_SCOPES = new Set<RestrictionScope>(["product", "variant", "rate_plan"])
const VALID_RULE_TYPES = new Set<SellabilityRuleType>(SELLABILITY_RULES.map((rule) => rule.type))
const DAY_LABELS: Record<number, string> = {
	1: "Lun",
	2: "Mar",
	3: "Mie",
	4: "Jue",
	5: "Vie",
	6: "Sab",
	7: "Dom",
}

function asString(value: unknown): string {
	return String(value ?? "").trim()
}

function asDateOnly(value: unknown): string {
	const raw = asString(value)
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		throw new Error("Dates must use YYYY-MM-DD")
	}
	const parsed = new Date(`${raw}T00:00:00.000Z`)
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
		throw new Error("Invalid date")
	}
	return raw
}

function daysBetweenInclusive(startDate: string, endDate: string): number {
	const start = new Date(`${startDate}T00:00:00.000Z`)
	const end = new Date(`${endDate}T00:00:00.000Z`)
	return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1)
}

function normalizeValidDays(value: unknown): number[] {
	const rawValues = Array.isArray(value) ? value : value == null ? [] : [value]
	const days = rawValues
		.map((entry) => Number(entry))
		.filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 7)
	return [...new Set(days)].sort((a, b) => a - b)
}

function formatValidDays(days: number[]): string {
	if (!days.length || days.length === 7) return "Todos los dias"
	return days.map((day) => DAY_LABELS[day] ?? String(day)).join(", ")
}

function estimateImpactDays(startDate: string, endDate: string, validDays: number[]): number {
	const totalDays = daysBetweenInclusive(startDate, endDate)
	if (!validDays.length || validDays.length === 7) return totalDays
	const activeDays = new Set(validDays)
	let count = 0
	const cursor = new Date(`${startDate}T00:00:00.000Z`)
	const end = new Date(`${endDate}T00:00:00.000Z`)
	while (cursor <= end) {
		const day = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay()
		if (activeDays.has(day)) count += 1
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return count
}

function formatValue(type: SellabilityRuleType, value: number | null): string {
	switch (type) {
		case "min_los":
			return `${value ?? 0}+ noches`
		case "max_los":
			return `${value ?? 0} noches max.`
		case "min_lead_time":
			return `${value ?? 0}+ dias antes`
		case "max_lead_time":
			return `${value ?? 0} dias max. antes`
		default:
			return "Sin valor"
	}
}

function impactLabel(type: SellabilityRuleType, value: number | null): string {
	switch (type) {
		case "stop_sell":
			return "Bloquea venta en las fechas aplicables."
		case "min_los":
			return `Bloquea estadias menores a ${value ?? 0} noches.`
		case "max_los":
			return `Bloquea estadias mayores a ${value ?? 0} noches.`
		case "cta":
			return "Bloquea llegadas en las fechas aplicables."
		case "ctd":
			return "Bloquea salidas en las fechas aplicables."
		case "min_lead_time":
			return `Bloquea reservas hechas con menos de ${value ?? 0} dias antes de la llegada.`
		case "max_lead_time":
			return `Bloquea reservas hechas con mas de ${value ?? 0} dias antes de la llegada.`
	}
}

function parseRuleType(value: unknown): SellabilityRuleType {
	const type = asString(value) as SellabilityRuleType
	if (!VALID_RULE_TYPES.has(type)) throw new Error("Tipo de regla de venta no soportado")
	return type
}

function parseScope(value: unknown): RestrictionScope {
	const scope = asString(value) as RestrictionScope
	if (!VALID_SCOPES.has(scope)) throw new Error("Alcance de regla de venta no soportado")
	return scope
}

function normalizeRuleValue(type: SellabilityRuleType, value: unknown): number | null {
	const definition = RULE_BY_TYPE.get(type)
	if (!definition?.requiresValue) return null
	const numberValue = Number(value)
	if (!Number.isFinite(numberValue) || numberValue < 1) {
		throw new Error("El valor de la regla debe ser un número positivo")
	}
	return Math.floor(numberValue)
}

function inferTargetName(params: {
	scope: RestrictionScope
	scopeId: string
	products: RestrictionSurfaceOption[]
	variants: RestrictionSurfaceOption[]
	ratePlans: RestrictionSurfaceOption[]
}): {
	targetName: string
	productId: string
	productName: string
	variantId?: string
	variantName?: string
	ratePlanId?: string
	ratePlanName?: string
} {
	if (params.scope === "product") {
		const product = params.products.find((entry) => entry.id === params.scopeId)
		return {
			targetName: product?.name ?? "Oferta",
			productId: product?.id ?? params.scopeId,
			productName: product?.name ?? "Oferta",
		}
	}
	if (params.scope === "variant") {
		const variant = params.variants.find((entry) => entry.id === params.scopeId)
		return {
			targetName: variant?.name ?? "Habitación",
			productId: variant?.productId ?? "",
			productName: variant?.productName ?? "",
			variantId: variant?.id ?? params.scopeId,
			variantName: variant?.name ?? "Habitación",
		}
	}
	const ratePlan = params.ratePlans.find((entry) => entry.id === params.scopeId)
	return {
		targetName: ratePlan?.name ?? "Tarifa",
		productId: ratePlan?.productId ?? "",
		productName: ratePlan?.productName ?? "",
		variantId: ratePlan?.variantId,
		variantName: ratePlan?.variantName,
		ratePlanId: ratePlan?.id ?? params.scopeId,
		ratePlanName: ratePlan?.name ?? "Tarifa",
	}
}

async function loadProviderTargets(providerId: string) {
	const products = await db
		.select({
			id: Product.id,
			name: Product.name,
			productType: Product.productType,
		})
		.from(Product)
		.where(eq(Product.providerId, providerId))
		.all()

	const productIds = products.map((product) => String(product.id))
	if (!productIds.length) {
		return { products: [], variants: [], ratePlans: [] }
	}

	const variants = await db
		.select({
			id: Variant.id,
			name: Variant.name,
			productId: Variant.productId,
			productName: Product.name,
		})
		.from(Variant)
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(inArray(Variant.productId, productIds))
		.all()

	const variantIds = variants.map((variant) => String(variant.id))
	const ratePlanName = await resolveRatePlanNameColumn()
	const ratePlans = variantIds.length
		? await db
				.select({
					id: RatePlan.id,
					name: ratePlanName,
					variantId: Variant.id,
					variantName: Variant.name,
					productId: Product.id,
					productName: Product.name,
				})
				.from(RatePlan)
				.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
				.innerJoin(Product, eq(Product.id, Variant.productId))
				.where(inArray(RatePlan.variantId, variantIds))
				.all()
		: []

	return {
		products: products.map((product) => ({
			id: String(product.id),
			name: String(product.name ?? "Oferta"),
			productType: String(product.productType ?? ""),
		})),
		variants: variants.map((variant) => ({
			id: String(variant.id),
			name: String(variant.name ?? "Habitación"),
			productId: String(variant.productId),
			productName: String(variant.productName ?? "Oferta"),
			productType: targetsProductType(products, String(variant.productId)),
		})),
		ratePlans: ratePlans.map((ratePlan) => ({
			id: String(ratePlan.id),
			name: String(ratePlan.name ?? "Tarifa"),
			productId: String(ratePlan.productId),
			productName: String(ratePlan.productName ?? "Oferta"),
			productType: targetsProductType(products, String(ratePlan.productId)),
			variantId: String(ratePlan.variantId),
			variantName: String(ratePlan.variantName ?? "Habitación"),
		})),
	}
}

function targetsProductType(
	products: Array<{ id: unknown; productType: unknown }>,
	productId: string
): string {
	return String(products.find((product) => String(product.id) === productId)?.productType ?? "")
}

function filterRules(
	rules: RestrictionSurfaceRule[],
	filters: RestrictionSurfaceFilters
): RestrictionSurfaceRule[] {
	return rules.filter((rule) => {
		if (filters.productId && rule.productId !== filters.productId) return false
		if (filters.variantId && rule.variantId !== filters.variantId) return false
		if (filters.ratePlanId && rule.ratePlanId !== filters.ratePlanId) return false
		if (filters.status === "active" && !rule.isActive) return false
		if (filters.status === "inactive" && rule.isActive) return false
		if (filters.type && filters.type !== "all" && rule.type !== filters.type) return false
		return true
	})
}

function getAllowedScopeIds(targets: Awaited<ReturnType<typeof loadProviderTargets>>) {
	return {
		product: new Set(targets.products.map((entry) => entry.id)),
		variant: new Set(targets.variants.map((entry) => entry.id)),
		rate_plan: new Set(targets.ratePlans.map((entry) => entry.id)),
	}
}

async function ensureNoOverlap(params: {
	scope: RestrictionScope
	scopeId: string
	type: SellabilityRuleType
	startDate: string
	endDate: string
	excludeId?: string
}) {
	const rows = await listCommercialSellabilityRulesForScopes({ scopeIds: [params.scopeId] })
	const overlapping = rows.some(
		(row) =>
			String(row.id) !== String(params.excludeId ?? "") &&
			row.scope === params.scope &&
			row.type === params.type &&
			row.startDate <= params.endDate &&
			row.endDate >= params.startDate
	)
	if (overlapping) {
		throw new Error("Another rule of this type already overlaps this target and date range")
	}
}

async function loadProviderRuleOrThrow(
	providerId: string,
	ruleId: string
): Promise<RestrictionSurfaceRule> {
	const model = await loadRestrictionsSurface(providerId, { status: "all" })
	const rule = model.rules.find((entry) => entry.id === ruleId)
	if (!rule) throw new Error("Regla de venta no encontrada para este proveedor")
	return rule
}

async function recomputeRuleProjection(params: {
	scope: RestrictionScope
	scopeId: string
	startDate: string
	endDate: string
	reason: string
}) {
	const result = await recomputeEffectiveRestrictionsForScope({
		scope: params.scope,
		scopeId: params.scopeId,
		from: params.startDate,
		to: toExclusiveRestrictionDate(params.endDate),
		reason: params.reason,
	})
	await rematerializeSearchUnitViewForRestrictions(result, params.reason)
}

async function rematerializeSearchUnitViewForRestrictions(
	result: RecomputeEffectiveRestrictionsResult,
	reason: string
): Promise<void> {
	if (!result.variantIds.length || result.rows === 0) return
	for (const variantId of result.variantIds) {
		try {
			const { materializeSearchUnitRange } = await import("@/modules/search/public")
			await materializeSearchUnitRange({
				variantId,
				from: result.from,
				to: result.to,
				currency: "USD",
			})
		} catch (error) {
			logger.warn("restrictions.search_unit_materialization_failed", {
				variantId,
				from: result.from,
				to: result.to,
				reason,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}
}

export async function loadRestrictionsSurface(
	providerId: string,
	filters: RestrictionSurfaceFilters = {}
): Promise<RestrictionsSurfaceModel> {
	const targets = await loadProviderTargets(providerId)
	const targetIds = [
		...targets.products.map((entry) => entry.id),
		...targets.variants.map((entry) => entry.id),
		...targets.ratePlans.map((entry) => entry.id),
	]
	const rawRules = await listCommercialSellabilityRulesForScopes({
		providerId,
		scopeIds: targetIds,
	})

	const rules = rawRules
		.map((row): RestrictionSurfaceRule | null => {
			const type = String(row.type ?? "") as SellabilityRuleType
			const scope = String(row.scope ?? "") as RestrictionScope
			if (!VALID_RULE_TYPES.has(type) || !VALID_SCOPES.has(scope)) return null
			const scopeId = String(row.scopeId)
			const definition = RULE_BY_TYPE.get(type)
			const value = row.value == null ? null : Number(row.value)
			const startDate = String(row.startDate)
			const endDate = String(row.endDate)
			const validDays = normalizeValidDays(row.validDays)
			const target = inferTargetName({ scope, scopeId, ...targets })
			const impactDays = estimateImpactDays(startDate, endDate, validDays)
			return {
				id: String(row.id),
				scope,
				scopeId,
				type,
				typeLabel: definition?.label ?? type,
				category: definition?.category ?? "Venta",
				value,
				valueLabel: formatValue(type, value),
				startDate,
				endDate,
				validDays,
				validDaysLabel: formatValidDays(validDays),
				isActive: Boolean(row.isActive),
				priority: Number(row.priority ?? 100),
				createdAt: row.createdAt,
				...target,
				impactDays,
				impactLabel: impactLabel(type, value),
			}
		})
		.filter((rule): rule is RestrictionSurfaceRule => rule != null)
		.sort((a, b) => {
			if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
			if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate)
			return a.targetName.localeCompare(b.targetName)
		})

	const filteredRules = filterRules(rules, filters)
	const activeRules = filteredRules.filter((rule) => rule.isActive)

	return {
		...targets,
		productTypes: [...new Set(targets.products.map((entry) => String(entry.productType ?? "")))],
		rules: filteredRules,
		stats: {
			totalRules: filteredRules.length,
			activeRules: activeRules.length,
			inactiveRules: filteredRules.length - activeRules.length,
			ratePlansImpacted: new Set(
				activeRules
					.map((rule) => rule.ratePlanId)
					.filter((ratePlanId): ratePlanId is string => Boolean(ratePlanId))
			).size,
			stopSellRules: activeRules.filter((rule) => rule.type === "stop_sell").length,
			arrivalDepartureRules: activeRules.filter(
				(rule) => rule.type === "cta" || rule.type === "ctd"
			).length,
			lengthOfStayRules: activeRules.filter(
				(rule) => rule.type === "min_los" || rule.type === "max_los"
			).length,
			bookingWindowRules: activeRules.filter(
				(rule) => rule.type === "min_lead_time" || rule.type === "max_lead_time"
			).length,
			estimatedBlockedOrConditionedDays: activeRules.reduce(
				(sum, rule) => sum + rule.impactDays,
				0
			),
		},
	}
}

export async function createRestrictionsSurfaceRule(
	providerId: string,
	form: FormData
): Promise<void> {
	const targets = await loadProviderTargets(providerId)
	const allowedScopeIds = getAllowedScopeIds(targets)
	const scope = parseScope(form.get("scope"))
	const scopeId = asString(form.get(`${scope}ScopeId`) || form.get("scopeId"))
	const type = parseRuleType(form.get("type"))
	const startDate = asDateOnly(form.get("startDate"))
	const endDate = asDateOnly(form.get("endDate"))
	if (endDate < startDate) throw new Error("End date must be after start date")
	if (!allowedScopeIds[scope].has(scopeId)) {
		throw new Error("Selected target does not belong to this provider")
	}
	const value = normalizeRuleValue(type, form.get("value"))
	const validDays = normalizeValidDays(form.getAll("validDays"))

	await ensureNoOverlap({ scope, scopeId, type, startDate, endDate })

	await createCommercialSellabilityRule({
		providerId,
		scope,
		scopeId,
		type,
		value,
		startDate,
		endDate,
		validDays,
		priority: computeRestrictionPriority(scope, type),
	})
	await recomputeRuleProjection({
		scope,
		scopeId,
		startDate,
		endDate,
		reason: "restriction_create",
	})
}

export async function updateRestrictionsSurfaceRule(
	providerId: string,
	form: FormData
): Promise<void> {
	const ruleId = asString(form.get("ruleId"))
	if (!ruleId) throw new Error("Missing rule id")
	const previous = await loadProviderRuleOrThrow(providerId, ruleId)
	const scope = parseScope(form.get("scope"))
	const scopeId = asString(form.get(`${scope}ScopeId`) || form.get("scopeId"))
	const type = parseRuleType(form.get("type"))
	const startDate = asDateOnly(form.get("startDate"))
	const endDate = asDateOnly(form.get("endDate"))
	if (endDate < startDate) throw new Error("End date must be after start date")
	const targets = await loadProviderTargets(providerId)
	const allowedScopeIds = getAllowedScopeIds(targets)
	if (!allowedScopeIds[scope].has(scopeId)) {
		throw new Error("Selected target does not belong to this provider")
	}
	const value = normalizeRuleValue(type, form.get("value"))
	const validDays = normalizeValidDays(form.getAll("validDays"))

	await ensureNoOverlap({ scope, scopeId, type, startDate, endDate, excludeId: ruleId })

	await setCommercialRuleActive(ruleId, false)
	await createCommercialSellabilityRule({
		providerId,
		scope,
		scopeId,
		type,
		value,
		startDate,
		endDate,
		validDays,
		priority: computeRestrictionPriority(scope, type),
	})
	await recomputeRuleProjection({
		scope: previous.scope,
		scopeId: previous.scopeId,
		startDate: previous.startDate,
		endDate: previous.endDate,
		reason: "restriction_update_previous",
	})
	await recomputeRuleProjection({
		scope,
		scopeId,
		startDate,
		endDate,
		reason: "restriction_update_next",
	})
}

export async function setRestrictionsSurfaceRuleActive(
	providerId: string,
	ruleId: string,
	isActive: boolean
): Promise<void> {
	const rule = await loadProviderRuleOrThrow(providerId, ruleId)
	await setCommercialRuleActive(ruleId, isActive)
	await recomputeRuleProjection({
		scope: rule.scope,
		scopeId: rule.scopeId,
		startDate: rule.startDate,
		endDate: rule.endDate,
		reason: isActive ? "restriction_activate" : "restriction_deactivate",
	})
}

export async function duplicateRestrictionsSurfaceRule(
	providerId: string,
	ruleId: string
): Promise<void> {
	const rule = await loadProviderRuleOrThrow(providerId, ruleId)
	const duplicate = await createCommercialSellabilityRule({
		providerId,
		scope: rule.scope,
		scopeId: rule.scopeId,
		type: rule.type,
		value: rule.value,
		startDate: rule.startDate,
		endDate: rule.endDate,
		validDays: rule.validDays,
		priority: rule.priority + 1,
	})
	await setCommercialRuleActive(duplicate.ruleId, false)
}

export async function deleteRestrictionsSurfaceRule(
	providerId: string,
	ruleId: string
): Promise<void> {
	const rule = await loadProviderRuleOrThrow(providerId, ruleId)
	await deleteCommercialRule(ruleId)
	await recomputeRuleProjection({
		scope: rule.scope,
		scopeId: rule.scopeId,
		startDate: rule.startDate,
		endDate: rule.endDate,
		reason: "restriction_delete",
	})
}
