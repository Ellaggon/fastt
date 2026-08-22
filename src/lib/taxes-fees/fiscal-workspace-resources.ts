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

export type FiscalSimulationIssueKind = "fiscal" | "commercial" | "coverage"

export type FiscalSimulationIssueId =
	| "missing_product"
	| "missing_variant"
	| "missing_active_rate_plan"
	| "missing_calendar"
	| "missing_availability"
	| "missing_price"
	| "no_matching_stay"
	| "missing_jurisdiction"
	| "incomplete_definition"
	| "unassigned"
	| "coverage_other_product"

export type FiscalSimulationIssue = {
	id: FiscalSimulationIssueId
	kind: FiscalSimulationIssueKind
	title: string
	description: string
	actionLabel: string
	href: string
}

export type FiscalSimulationRecommendation = {
	context: FiscalSimulationContext | null
	issues: FiscalSimulationIssue[]
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

function calendarHref(ratePlanId: string, variantId: string, focus: "price" | "availability") {
	const params = new URLSearchParams({ ratePlanId, variantId, focus })
	return `/rates/calendar?${params.toString()}`
}

export function fiscalRatePlanDisplayLabel(planLabel: string, variantLabel?: string | null) {
	const plan = String(planLabel || "Tarifa").trim()
	const variant = String(variantLabel ?? "").trim()
	if (!variant || variant === plan) return plan
	return `${plan} · ${variant}`
}

export function selectFiscalSimulationDiagnosticPlan<T extends { id: string }>(
	plans: T[],
	scoreByPlanId: Map<string, number>
) {
	return [...plans].sort((left, right) => {
		const scoreDelta = (scoreByPlanId.get(right.id) ?? 0) - (scoreByPlanId.get(left.id) ?? 0)
		if (scoreDelta !== 0) return scoreDelta
		return left.id.localeCompare(right.id)
	})[0]
}

function productSetupHref(product: FiscalWorkspaceResources["products"][number]) {
	const productId = encodeURIComponent(product.id)
	const kind = product.kind.toLocaleLowerCase()
	if (kind.includes("hotel")) return `/product/${productId}/rooms`
	if (kind.includes("tour")) return `/product/${productId}/departures`
	return `/product/${productId}`
}

function commercialIssue(issue: Omit<FiscalSimulationIssue, "kind">): FiscalSimulationIssue {
	return { ...issue, kind: "commercial" }
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

/** Chooses the first genuinely sellable Friday-to-Sunday context for the requested commercial target. */
export async function getRecommendedFiscalSimulationContext(input: {
	resources: FiscalWorkspaceResources
	preferredProductId?: string | null
	preferredVariantId?: string | null
	preferredRatePlanId?: string | null
}): Promise<FiscalSimulationRecommendation> {
	const start = nextFriday()
	const windowEnd = dayString(addUtcDays(start, 32))
	const preferredPlan = input.resources.ratePlans.find(
		(plan) => plan.id === input.preferredRatePlanId
	)
	const preferredVariant = input.resources.variants.find(
		(variant) => variant.id === input.preferredVariantId
	)
	const preferredProduct = input.resources.products.find(
		(product) =>
			product.id ===
			(preferredPlan?.productId ?? preferredVariant?.productId ?? input.preferredProductId)
	)
	const targetProduct = preferredProduct ?? input.resources.products[0] ?? null
	if (!targetProduct) {
		return {
			context: null,
			issues: [
				commercialIssue({
					id: "missing_product",
					title: "No hay un producto para probar",
					description: "Crea un producto antes de comprobar esta regla.",
					actionLabel: "Crear producto",
					href: "/product/create",
				}),
			],
		}
	}

	const restrictToTarget = Boolean(
		input.preferredProductId || input.preferredVariantId || input.preferredRatePlanId
	)
	const targetVariants = input.resources.variants.filter((variant) =>
		input.preferredVariantId
			? variant.id === input.preferredVariantId
			: variant.productId === targetProduct.id
	)
	const activePlansForTarget = input.resources.ratePlans.filter((plan) => {
		if (!plan.isActive) return false
		if (input.preferredRatePlanId) return plan.id === input.preferredRatePlanId
		if (input.preferredVariantId) return plan.variantId === input.preferredVariantId
		return plan.productId === targetProduct.id
	})
	const candidates = (
		restrictToTarget
			? activePlansForTarget.filter((plan) => Boolean(plan.variantId))
			: input.resources.ratePlans
					.filter((plan) => plan.isActive && Boolean(plan.variantId))
					.sort(
						(left, right) =>
							Number(right.productId === targetProduct.id) -
							Number(left.productId === targetProduct.id)
					)
	).slice(0, 24)
	const candidateIds = candidates.map((plan) => plan.id)
	if (!candidateIds.length) {
		const issues: FiscalSimulationIssue[] = []
		if (!targetVariants.length) {
			issues.push(
				commercialIssue({
					id: "missing_variant",
					title: `${targetProduct.label} no tiene una unidad`,
					description: "Asocia una habitación o salida a una tarifa para probar el cobro.",
					actionLabel: "Configurar unidad",
					href: productSetupHref(targetProduct),
				})
			)
		}
		if (!activePlansForTarget.length) {
			issues.push(
				commercialIssue({
					id: "missing_active_rate_plan",
					title: `${targetProduct.label} no tiene una tarifa activa`,
					description: "Activa o crea una tarifa para obtener un precio de prueba.",
					actionLabel: "Ver tarifas",
					href: `/rates/plans/manage?productId=${encodeURIComponent(targetProduct.id)}`,
				})
			)
		}
		return { context: null, issues }
	}
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
				context: {
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
				},
				issues: [],
			}
		}
	}

	const candidateDates = Array.from({ length: 31 }, (_, index) =>
		dayString(addUtcDays(start, index))
	)
	const scoreByPlanId = new Map<string, number>()
	for (const plan of candidates) {
		const planInventory = inventoryRows.filter((row) => row.ratePlanId === plan.id)
		const planPricing = effectiveRows.filter((row) => row.ratePlanId === plan.id)
		const inventoryByDate = new Map(planInventory.map((row) => [normalizedDay(row.date), row]))
		const pricingByDate = new Map(planPricing.map((row) => [normalizedDay(row.date), row]))
		const hasTwoAvailableNights = candidateDates.slice(0, -1).some((date, index) => {
			const nextDate = candidateDates[index + 1]!
			return [inventoryByDate.get(date), inventoryByDate.get(nextDate)].every(
				(row) =>
					row &&
					row.isAvailable &&
					row.hasAvailability &&
					Number(row.availableUnits ?? 0) > 0 &&
					!String(row.primaryBlocker ?? "").trim()
			)
		})
		const hasTwoPricedNights = candidateDates.slice(0, -1).some((date, index) => {
			const nextDate = candidateDates[index + 1]!
			return [date, nextDate].every((day) => {
				const inventory = inventoryByDate.get(day)
				const effective = pricingByDate.get(day)
				return Boolean(inventory?.hasPrice && Number(effective?.price ?? inventory.price ?? 0) > 0)
			})
		})
		scoreByPlanId.set(
			plan.id,
			(hasTwoAvailableNights ? 8 : 0) +
				(hasTwoPricedNights ? 8 : 0) +
				Math.min(planInventory.length, 8) +
				Math.min(planPricing.length, 4)
		)
	}
	const targetPlan =
		selectFiscalSimulationDiagnosticPlan(candidates, scoreByPlanId) ?? candidates[0]!
	const targetVariant = input.resources.variants.find((item) => item.id === targetPlan.variantId)
	const targetLabel = fiscalRatePlanDisplayLabel(targetPlan.label, targetVariant?.label)
	const targetInventory = inventoryRows.filter((row) => row.ratePlanId === targetPlan.id)
	const targetEffectivePricing = effectiveRows.filter((row) => row.ratePlanId === targetPlan.id)
	const targetInventoryByDate = new Map(
		targetInventory.map((row) => [normalizedDay(row.date), row])
	)
	const targetPricingByDate = new Map(
		targetEffectivePricing.map((row) => [normalizedDay(row.date), row])
	)
	const hasTwoAvailableNights = candidateDates.slice(0, -1).some((date, index) => {
		const nextDate = candidateDates[index + 1]!
		return [targetInventoryByDate.get(date), targetInventoryByDate.get(nextDate)].every(
			(row) =>
				row &&
				row.isAvailable &&
				row.hasAvailability &&
				Number(row.availableUnits ?? 0) > 0 &&
				!String(row.primaryBlocker ?? "").trim()
		)
	})
	const hasTwoPricedNights = candidateDates.slice(0, -1).some((date, index) => {
		const nextDate = candidateDates[index + 1]!
		return [date, nextDate].every((day) => {
			const inventory = targetInventoryByDate.get(day)
			const effective = targetPricingByDate.get(day)
			return Boolean(inventory?.hasPrice && Number(effective?.price ?? inventory.price ?? 0) > 0)
		})
	})
	const issues: FiscalSimulationIssue[] = []
	if (!targetInventory.length) {
		issues.push(
			commercialIssue({
				id: "missing_calendar",
				title: `Sin calendario en ${targetLabel}`,
				description:
					"Esta tarifa aún no tiene fechas con precio y cupo en las próximas cuatro semanas.",
				actionLabel: "Abrir calendario",
				href: calendarHref(targetPlan.id, targetPlan.variantId, "price"),
			})
		)
	} else {
		if (!hasTwoAvailableNights) {
			issues.push(
				commercialIssue({
					id: "missing_availability",
					title: `Sin fechas libres en ${targetLabel}`,
					description:
						"Necesitas dos noches seguidas con cupo en las próximas cuatro semanas, a partir del próximo viernes.",
					actionLabel: "Abrir calendario",
					href: calendarHref(targetPlan.id, targetPlan.variantId, "availability"),
				})
			)
		}
		if (!hasTwoPricedNights) {
			issues.push(
				commercialIssue({
					id: "missing_price",
					title: `Sin precio en ${targetLabel}`,
					description:
						"Pon un precio mayor que cero en las mismas dos noches seguidas de las próximas cuatro semanas.",
					actionLabel: "Poner precios",
					href: calendarHref(targetPlan.id, targetPlan.variantId, "price"),
				})
			)
		}
		if (hasTwoAvailableNights && hasTwoPricedNights) {
			issues.push(
				commercialIssue({
					id: "no_matching_stay",
					title: `Precio y cupo no coinciden en ${targetLabel}`,
					description:
						"Pon precio y cupo en las mismas dos noches seguidas de las próximas cuatro semanas.",
					actionLabel: "Abrir calendario",
					href: calendarHref(targetPlan.id, targetPlan.variantId, "availability"),
				})
			)
		}
	}
	return { context: null, issues }
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
