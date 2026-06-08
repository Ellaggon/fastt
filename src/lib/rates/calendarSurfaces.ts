import {
	and,
	asc,
	db,
	desc,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	eq,
	gte,
	inArray,
	lt,
	Product,
	RatePlanOccupancyPolicy,
	SearchUnitView,
} from "astro:db"

import type { RatePlanListItem } from "@/lib/rates/loadRatePlansReadModel"
import {
	evaluateMaterializationFreshness,
	summarizeMaterializationFreshness,
	type MaterializationFreshness,
} from "@/lib/rates/materializationFreshness"
import { resolveVerticalVocabulary } from "@/lib/verticalVocabulary"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"

const DEFAULT_OCCUPANCY_KEY = buildOccupancyKey(
	normalizeOccupancy({ adults: 2, children: 0, infants: 0 })
)

export type CalendarDay = {
	date: string
	day: number
	weekday: string
	isPast: boolean
}

export type CalendarRestrictionSignals = {
	count: number
	ratePlanCount: number
	stopSell: boolean
	cta: boolean
	ctd: boolean
	minStay: number | null
	maxStay: number | null
	minLeadTime: number | null
	maxLeadTime: number | null
	summary: string | null
	hasCommercialBlocker: boolean
}

export type PricingCalendarDay = CalendarDay & {
	hasPrice: boolean
	finalPrice: number | null
	currency: string
	baseComponent: number | null
	ruleAdjustment: number | null
	status: "priced" | "missing" | "past"
	operationalStatus: "sellable" | "no_price" | "no_inventory" | "closed" | "restricted" | "past"
	operationalStatusLabel: string
	priceSignal: "gap" | "manual_override" | "baseline" | "effective" | "past"
	priceSignalLabel: string
	hasInventory: boolean
	totalUnits: number
	bookedUnits: number
	heldUnits: number
	availableUnits: number
	capacitySignal: "healthy" | "low" | "sold_out" | "missing" | "past"
	capacitySignalLabel: string
	utilizationPercent: number | null
	restrictionSignals: CalendarRestrictionSignals
}

export type InventoryCalendarDay = CalendarDay & {
	hasInventory: boolean
	totalUnits: number
	bookedUnits: number
	heldUnits: number
	availableUnits: number
	status: "available" | "low" | "sold_out" | "missing" | "past"
	capacitySignal: "healthy" | "low" | "sold_out" | "missing" | "past"
	capacitySignalLabel: string
	utilizationPercent: number | null
	restrictionSignals: CalendarRestrictionSignals
}

export type CalendarSummary = {
	totalDays: number
	activeDays: number
	missingDays: number
	attentionDays: number
	coveragePercent: number
}

export type PricingCalendarSurface = {
	rows: RatePlanListItem[]
	selectedRatePlan: RatePlanListItem | null
	month: string
	previousMonth: string
	nextMonth: string
	startDate: string
	endDate: string
	vocabulary: ReturnType<typeof resolveVerticalVocabulary>
	baseline: {
		currency: string
		basePrice: number | null
	}
	days: PricingCalendarDay[]
	summary: CalendarSummary
	freshness: {
		overall: MaterializationFreshness
		pricing: MaterializationFreshness
		availability: MaterializationFreshness
		restrictions: MaterializationFreshness
		search: MaterializationFreshness
	}
}

export type InventoryCalendarSurface = {
	rows: RatePlanListItem[]
	variants: Array<{
		variantId: string
		variantName: string
		productId: string
		productName: string
		ratePlanCount: number
	}>
	selectedVariant: {
		variantId: string
		variantName: string
		productId: string
		productName: string
		ratePlanCount: number
	} | null
	month: string
	previousMonth: string
	nextMonth: string
	startDate: string
	endDate: string
	vocabulary: ReturnType<typeof resolveVerticalVocabulary>
	days: InventoryCalendarDay[]
	summary: CalendarSummary
	freshness: {
		overall: MaterializationFreshness
		availability: MaterializationFreshness
		restrictions: MaterializationFreshness
		search: MaterializationFreshness
	}
}

function toDateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function parseMonth(raw: string | null): Date {
	const value = String(raw ?? "").trim()
	const match = /^(\d{4})-(\d{2})$/.exec(value)
	if (match) {
		const year = Number(match[1])
		const month = Number(match[2])
		if (month >= 1 && month <= 12) return new Date(Date.UTC(year, month - 1, 1))
	}
	const now = new Date()
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function addMonths(date: Date, months: number): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function monthKey(date: Date): string {
	return toDateOnly(date).slice(0, 7)
}

function enumerateMonthDays(monthStart: Date): CalendarDay[] {
	const today = toDateOnly(new Date())
	const cursor = new Date(monthStart)
	const days: CalendarDay[] = []
	while (cursor.getUTCMonth() === monthStart.getUTCMonth()) {
		const date = toDateOnly(cursor)
		days.push({
			date,
			day: cursor.getUTCDate(),
			weekday: ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][cursor.getUTCDay()],
			isPast: date < today,
		})
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return days
}

function enumerateConsecutiveMonthDays(monthStart: Date, monthCount: number): CalendarDay[] {
	const safeMonthCount = Math.max(1, Math.min(3, Math.trunc(Number(monthCount) || 1)))
	return Array.from({ length: safeMonthCount }, (_, index) =>
		enumerateMonthDays(addMonths(monthStart, index))
	).flat()
}

function exclusiveEnd(days: CalendarDay[]): string {
	const last = days[days.length - 1]
	if (!last) return toDateOnly(new Date())
	const end = new Date(`${last.date}T00:00:00.000Z`)
	end.setUTCDate(end.getUTCDate() + 1)
	return toDateOnly(end)
}

function summarize(
	days: Array<{ status: string; isPast: boolean }>,
	goodStatus: string
): CalendarSummary {
	const active = days.filter((day) => !day.isPast)
	const missingDays = active.filter((day) => day.status === "missing").length
	const attentionDays = active.filter(
		(day) => day.status !== goodStatus && day.status !== "past"
	).length
	const activeDays = active.length
	const readyDays = active.filter((day) => day.status === goodStatus).length
	return {
		totalDays: days.length,
		activeDays,
		missingDays,
		attentionDays,
		coveragePercent: activeDays > 0 ? Math.round((readyDays / activeDays) * 100) : 0,
	}
}

type RestrictionSignalRow = {
	date: string
	ratePlanId: string | null
	stopSell: boolean
	cta: boolean
	ctd: boolean
	minStay: number | null
	maxStay: number | null
	minLeadTime: number | null
	maxLeadTime: number | null
	computedAt: Date | string | null
}

function emptyRestrictionSignals(): CalendarRestrictionSignals {
	return {
		count: 0,
		ratePlanCount: 0,
		stopSell: false,
		cta: false,
		ctd: false,
		minStay: null,
		maxStay: null,
		minLeadTime: null,
		maxLeadTime: null,
		summary: null,
		hasCommercialBlocker: false,
	}
}

function buildRestrictionSummary(
	signals: Omit<CalendarRestrictionSignals, "summary">
): string | null {
	const labels: string[] = []
	if (signals.stopSell) labels.push("Stop Sell")
	if (signals.cta) labels.push("CTA")
	if (signals.ctd) labels.push("CTD")
	if (signals.minStay != null || signals.maxStay != null) labels.push("LOS")
	if (signals.minLeadTime != null || signals.maxLeadTime != null) labels.push("Booking Window")
	return labels.length ? labels.join(" · ") : null
}

function groupRestrictionSignals(
	rows: RestrictionSignalRow[]
): Map<string, CalendarRestrictionSignals> {
	const byDate = new Map<
		string,
		Omit<CalendarRestrictionSignals, "summary"> & { ratePlanIds: Set<string> }
	>()
	for (const row of rows) {
		const date = String(row.date)
		const current =
			byDate.get(date) ??
			({
				...emptyRestrictionSignals(),
				ratePlanIds: new Set<string>(),
			} as Omit<CalendarRestrictionSignals, "summary"> & { ratePlanIds: Set<string> })
		const rowSignals = [
			Boolean(row.stopSell),
			Boolean(row.cta),
			Boolean(row.ctd),
			row.minStay != null,
			row.maxStay != null,
			row.minLeadTime != null,
			row.maxLeadTime != null,
		].filter(Boolean).length
		current.count += rowSignals
		if (row.ratePlanId) current.ratePlanIds.add(String(row.ratePlanId))
		current.stopSell = current.stopSell || Boolean(row.stopSell)
		current.cta = current.cta || Boolean(row.cta)
		current.ctd = current.ctd || Boolean(row.ctd)
		current.minStay = maxNullable(current.minStay, row.minStay)
		current.maxStay = minNullable(current.maxStay, row.maxStay)
		current.minLeadTime = maxNullable(current.minLeadTime, row.minLeadTime)
		current.maxLeadTime = minNullable(current.maxLeadTime, row.maxLeadTime)
		current.hasCommercialBlocker =
			current.hasCommercialBlocker || Boolean(row.stopSell || row.cta || row.ctd)
		byDate.set(date, current)
	}

	return new Map(
		[...byDate.entries()].map(([date, signals]) => {
			const { ratePlanIds, ...rest } = signals
			const normalized = {
				...rest,
				ratePlanCount: ratePlanIds.size,
				summary: buildRestrictionSummary(rest),
			}
			return [date, normalized]
		})
	)
}

function maxNullable(current: number | null, next: number | null): number | null {
	if (next == null) return current
	if (current == null) return Number(next)
	return Math.max(Number(current), Number(next))
}

function minNullable(current: number | null, next: number | null): number | null {
	if (next == null) return current
	if (current == null) return Number(next)
	return Math.min(Number(current), Number(next))
}

function resolvePricingSignal(params: {
	hasPrice: boolean
	isPast: boolean
	ruleAdjustment: number | null
	baseComponent: number | null
}): Pick<PricingCalendarDay, "priceSignal" | "priceSignalLabel"> {
	if (params.isPast) return { priceSignal: "past", priceSignalLabel: "Pasado" }
	if (!params.hasPrice) return { priceSignal: "gap", priceSignalLabel: "Gap" }
	if (Number(params.ruleAdjustment ?? 0) !== 0) {
		return { priceSignal: "manual_override", priceSignalLabel: "Ajuste" }
	}
	if (params.baseComponent != null) return { priceSignal: "baseline", priceSignalLabel: "Heredado" }
	return { priceSignal: "effective", priceSignalLabel: "Efectivo" }
}

function resolveCapacitySignal(
	status: InventoryCalendarDay["status"]
): Pick<InventoryCalendarDay, "capacitySignal" | "capacitySignalLabel"> {
	if (status === "past") return { capacitySignal: "past", capacitySignalLabel: "Pasado" }
	if (status === "missing") return { capacitySignal: "missing", capacitySignalLabel: "Sin dato" }
	if (status === "sold_out") return { capacitySignal: "sold_out", capacitySignalLabel: "Agotado" }
	if (status === "low") return { capacitySignal: "low", capacitySignalLabel: "Bajo" }
	return { capacitySignal: "healthy", capacitySignalLabel: "Saludable" }
}

function resolveOperationalStatus(params: {
	isPast: boolean
	hasPrice: boolean
	hasInventory: boolean
	availableUnits: number
	restrictionSignals: CalendarRestrictionSignals
}): Pick<PricingCalendarDay, "operationalStatus" | "operationalStatusLabel"> {
	if (params.isPast) return { operationalStatus: "past", operationalStatusLabel: "Pasado" }
	if (!params.hasPrice)
		return { operationalStatus: "no_price", operationalStatusLabel: "Sin precio" }
	if (!params.hasInventory || params.availableUnits <= 0) {
		return { operationalStatus: "no_inventory", operationalStatusLabel: "Sin cupo" }
	}
	if (params.restrictionSignals.hasCommercialBlocker) {
		return { operationalStatus: "closed", operationalStatusLabel: "Cerrado" }
	}
	if (params.restrictionSignals.count > 0) {
		return { operationalStatus: "restricted", operationalStatusLabel: "Restringido" }
	}
	return { operationalStatus: "sellable", operationalStatusLabel: "Vendible" }
}

function toRestrictionSignalRow(row: {
	date: string
	ratePlanId?: string | null
	stopSell?: boolean | null
	cta?: boolean | null
	ctd?: boolean | null
	minStay?: number | null
	maxStay?: number | null
	minLeadTime?: number | null
	maxLeadTime?: number | null
	computedAt?: Date | string | null
}): RestrictionSignalRow {
	return {
		date: String(row.date),
		ratePlanId: row.ratePlanId == null ? null : String(row.ratePlanId),
		stopSell: Boolean(row.stopSell),
		cta: Boolean(row.cta),
		ctd: Boolean(row.ctd),
		minStay: row.minStay == null ? null : Number(row.minStay),
		maxStay: row.maxStay == null ? null : Number(row.maxStay),
		minLeadTime: row.minLeadTime == null ? null : Number(row.minLeadTime),
		maxLeadTime: row.maxLeadTime == null ? null : Number(row.maxLeadTime),
		computedAt: row.computedAt ?? null,
	}
}

async function loadRestrictionSignalRows(input: {
	variantId: string
	ratePlanId?: string | null
	startDate: string
	endDate: string
}): Promise<RestrictionSignalRow[]> {
	const selectCanonical = {
		date: EffectiveRestriction.date,
		ratePlanId: EffectiveRestriction.ratePlanId,
		stopSell: EffectiveRestriction.stopSell,
		cta: EffectiveRestriction.cta,
		ctd: EffectiveRestriction.ctd,
		minStay: EffectiveRestriction.minStay,
		maxStay: EffectiveRestriction.maxStay,
		minLeadTime: EffectiveRestriction.minLeadTime,
		maxLeadTime: EffectiveRestriction.maxLeadTime,
		computedAt: EffectiveRestriction.computedAt,
	}
	const selectLegacy = {
		date: EffectiveRestriction.date,
		stopSell: EffectiveRestriction.stopSell,
		cta: EffectiveRestriction.cta,
		ctd: EffectiveRestriction.ctd,
		minStay: EffectiveRestriction.minStay,
		computedAt: EffectiveRestriction.computedAt,
	}

	if (input.ratePlanId) {
		try {
			const rows = await db
				.select(selectCanonical)
				.from(EffectiveRestriction)
				.where(
					and(
						eq(EffectiveRestriction.ratePlanId, String(input.ratePlanId)),
						gte(EffectiveRestriction.date, input.startDate),
						lt(EffectiveRestriction.date, input.endDate)
					)
				)
				.orderBy(asc(EffectiveRestriction.date))
				.all()
			return rows.map(toRestrictionSignalRow)
		} catch (error) {
			if (!isMissingEffectiveRestrictionColumn(error)) throw error
		}
	}

	try {
		const rows = await db
			.select(selectCanonical)
			.from(EffectiveRestriction)
			.where(
				and(
					eq(EffectiveRestriction.variantId, input.variantId),
					gte(EffectiveRestriction.date, input.startDate),
					lt(EffectiveRestriction.date, input.endDate)
				)
			)
			.orderBy(asc(EffectiveRestriction.date))
			.all()
		return rows.map(toRestrictionSignalRow)
	} catch (error) {
		if (!isMissingEffectiveRestrictionColumn(error)) throw error
	}

	const rows = await db
		.select(selectLegacy)
		.from(EffectiveRestriction)
		.where(
			and(
				eq(EffectiveRestriction.variantId, input.variantId),
				gte(EffectiveRestriction.date, input.startDate),
				lt(EffectiveRestriction.date, input.endDate)
			)
		)
		.orderBy(asc(EffectiveRestriction.date))
		.all()
	return rows.map(toRestrictionSignalRow)
}

function isMissingEffectiveRestrictionColumn(error: unknown): boolean {
	return /no such column: (ratePlanId|maxStay|minLeadTime|maxLeadTime)/i.test(
		String(error instanceof Error ? error.message : error)
	)
}

async function loadSearchMaterializationRows(input: {
	variantId: string
	ratePlanId?: string | null
	startDate: string
	endDate: string
}): Promise<Array<{ date: string; computedAt: Date | string | null }>> {
	const filters = [
		eq(SearchUnitView.variantId, input.variantId),
		eq(SearchUnitView.occupancyKey, DEFAULT_OCCUPANCY_KEY),
		gte(SearchUnitView.date, input.startDate),
		lt(SearchUnitView.date, input.endDate),
	]
	if (input.ratePlanId) filters.push(eq(SearchUnitView.ratePlanId, String(input.ratePlanId)))
	const rows = await db
		.select({
			date: SearchUnitView.date,
			computedAt: SearchUnitView.computedAt,
		})
		.from(SearchUnitView)
		.where(and(...filters))
		.orderBy(asc(SearchUnitView.date))
		.all()
	const byDate = new Map<string, { date: string; computedAt: Date | string | null }>()
	for (const row of rows) {
		const date = String(row.date)
		if (!byDate.has(date)) {
			byDate.set(date, {
				date,
				computedAt: row.computedAt ?? null,
			})
		}
	}
	return [...byDate.values()]
}

function activeDayCount(days: CalendarDay[]): number {
	return days.filter((day) => !day.isPast).length
}

async function resolveVocabulary(rows: RatePlanListItem[]) {
	const productIds = [...new Set(rows.map((row) => String(row.productId)).filter(Boolean))]
	if (!productIds.length) return resolveVerticalVocabulary([])
	const products = await db
		.select({ productType: Product.productType })
		.from(Product)
		.where(inArray(Product.id, productIds))
		.all()
	return resolveVerticalVocabulary(products.map((product) => product.productType))
}

async function loadBaseline(
	ratePlanId: string
): Promise<{ currency: string; basePrice: number | null }> {
	const policy = await db
		.select({
			currency: RatePlanOccupancyPolicy.baseCurrency,
			basePrice: RatePlanOccupancyPolicy.baseAmount,
		})
		.from(RatePlanOccupancyPolicy)
		.where(eq(RatePlanOccupancyPolicy.ratePlanId, ratePlanId))
		.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id))
		.get()
	return {
		currency: String(policy?.currency ?? "USD"),
		basePrice: policy?.basePrice == null ? null : Number(policy.basePrice),
	}
}

export async function buildPricingCalendarSurface(input: {
	rows: RatePlanListItem[]
	ratePlanId?: string | null
	month?: string | null
	visibleMonths?: number
}): Promise<PricingCalendarSurface> {
	const rows = input.rows
	const selectedRatePlan =
		rows.find((row) => String(row.ratePlanId) === String(input.ratePlanId ?? "")) ??
		rows.find((row) => row.isDefault && row.isActive) ??
		rows.find((row) => row.isActive) ??
		rows[0] ??
		null
	const monthStart = parseMonth(input.month ?? null)
	const baseDays = enumerateConsecutiveMonthDays(monthStart, input.visibleMonths ?? 1)
	const startDate = baseDays[0]?.date ?? toDateOnly(monthStart)
	const endDate = exclusiveEnd(baseDays)
	const vocabulary = await resolveVocabulary(rows)
	const baseline = selectedRatePlan
		? await loadBaseline(String(selectedRatePlan.ratePlanId))
		: { currency: "USD", basePrice: null }

	const pricingRows = selectedRatePlan
		? await db
				.select({
					date: EffectivePricingV2.date,
					finalPrice: EffectivePricingV2.finalBasePrice,
					currency: EffectivePricingV2.currency,
					baseComponent: EffectivePricingV2.baseComponent,
					ruleAdjustment: EffectivePricingV2.ruleAdjustment,
					computedAt: EffectivePricingV2.computedAt,
				})
				.from(EffectivePricingV2)
				.where(
					and(
						eq(EffectivePricingV2.ratePlanId, String(selectedRatePlan.ratePlanId)),
						eq(EffectivePricingV2.occupancyKey, DEFAULT_OCCUPANCY_KEY),
						gte(EffectivePricingV2.date, startDate),
						lt(EffectivePricingV2.date, endDate)
					)
				)
				.orderBy(asc(EffectivePricingV2.date))
				.all()
		: []
	const restrictionRows = selectedRatePlan
		? await loadRestrictionSignalRows({
				variantId: String(selectedRatePlan.variantId),
				ratePlanId: String(selectedRatePlan.ratePlanId),
				startDate,
				endDate,
			})
		: []
	const availabilityRows = selectedRatePlan
		? await db
				.select({
					date: EffectiveAvailability.date,
					totalUnits: EffectiveAvailability.totalUnits,
					bookedUnits: EffectiveAvailability.bookedUnits,
					heldUnits: EffectiveAvailability.heldUnits,
					availableUnits: EffectiveAvailability.availableUnits,
					computedAt: EffectiveAvailability.computedAt,
				})
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, String(selectedRatePlan.variantId)),
						gte(EffectiveAvailability.date, startDate),
						lt(EffectiveAvailability.date, endDate)
					)
				)
				.orderBy(asc(EffectiveAvailability.date))
				.all()
		: []
	const searchRows = selectedRatePlan
		? await loadSearchMaterializationRows({
				variantId: String(selectedRatePlan.variantId),
				ratePlanId: String(selectedRatePlan.ratePlanId),
				startDate,
				endDate,
			})
		: []
	const byDate = new Map(pricingRows.map((row) => [String(row.date), row]))
	const availabilityByDate = new Map(availabilityRows.map((row) => [String(row.date), row]))
	const restrictionSignalsByDate = groupRestrictionSignals(restrictionRows)
	const days: PricingCalendarDay[] = baseDays.map((day) => {
		const row = byDate.get(day.date)
		const availability = availabilityByDate.get(day.date)
		const hasPrice = row?.finalPrice != null
		const ruleAdjustment = row?.ruleAdjustment == null ? null : Number(row.ruleAdjustment)
		const baseComponent = row?.baseComponent == null ? null : Number(row.baseComponent)
		const hasInventory = Boolean(availability)
		const totalUnits = Number(availability?.totalUnits ?? 0)
		const availableUnits = Number(availability?.availableUnits ?? 0)
		const restrictionSignals = restrictionSignalsByDate.get(day.date) ?? emptyRestrictionSignals()
		const capacityStatus: InventoryCalendarDay["status"] = day.isPast
			? "past"
			: !hasInventory
				? "missing"
				: availableUnits <= 0
					? "sold_out"
					: availableUnits <= Math.max(1, Math.floor(totalUnits * 0.25))
						? "low"
						: "available"
		const utilizationPercent =
			hasInventory && totalUnits > 0
				? Math.round(((totalUnits - Math.max(0, availableUnits)) / totalUnits) * 100)
				: null
		return {
			...day,
			hasPrice,
			finalPrice: hasPrice ? Number(row?.finalPrice ?? 0) : null,
			currency: String(row?.currency ?? baseline.currency),
			baseComponent,
			ruleAdjustment,
			status: day.isPast ? "past" : hasPrice ? "priced" : "missing",
			...resolvePricingSignal({
				hasPrice,
				isPast: day.isPast,
				ruleAdjustment,
				baseComponent,
			}),
			hasInventory,
			totalUnits,
			bookedUnits: Number(availability?.bookedUnits ?? 0),
			heldUnits: Number(availability?.heldUnits ?? 0),
			availableUnits,
			...resolveCapacitySignal(capacityStatus),
			utilizationPercent,
			restrictionSignals,
			...resolveOperationalStatus({
				isPast: day.isPast,
				hasPrice,
				hasInventory,
				availableUnits,
				restrictionSignals,
			}),
		}
	})

	const expectedRows = activeDayCount(baseDays)
	const pricingFreshness = evaluateMaterializationFreshness({
		label: "Precios",
		expectedRows,
		timestamps: pricingRows.map((row) => row.computedAt),
	})
	const restrictionFreshness = evaluateMaterializationFreshness({
		label: "Restricciones",
		expectedRows,
		timestamps: restrictionRows.map((row) => row.computedAt),
	})
	const availabilityFreshness = evaluateMaterializationFreshness({
		label: "Inventario",
		expectedRows,
		timestamps: availabilityRows.map((row) => row.computedAt),
	})
	const searchFreshness = evaluateMaterializationFreshness({
		label: "Busqueda",
		expectedRows,
		timestamps: searchRows.map((row) => row.computedAt),
		delayedAfterMinutes: 45,
		staleAfterMinutes: 240,
	})
	const freshness = {
		pricing: pricingFreshness,
		availability: availabilityFreshness,
		restrictions: restrictionFreshness,
		search: searchFreshness,
		overall: summarizeMaterializationFreshness([
			pricingFreshness,
			availabilityFreshness,
			restrictionFreshness,
			searchFreshness,
		]),
	}

	return {
		rows,
		selectedRatePlan,
		month: monthKey(monthStart),
		previousMonth: monthKey(addMonths(monthStart, -1)),
		nextMonth: monthKey(addMonths(monthStart, 1)),
		startDate,
		endDate,
		vocabulary,
		baseline,
		days,
		summary: summarize(days, "priced"),
		freshness,
	}
}

export async function buildInventoryCalendarSurface(input: {
	rows: RatePlanListItem[]
	variantId?: string | null
	month?: string | null
}): Promise<InventoryCalendarSurface> {
	const rows = input.rows
	const variants = [...rows.values()].reduce<InventoryCalendarSurface["variants"]>((acc, row) => {
		const variantId = String(row.variantId)
		const existing = acc.find((item) => item.variantId === variantId)
		if (existing) {
			existing.ratePlanCount += 1
			return acc
		}
		acc.push({
			variantId,
			variantName: String(row.variantName),
			productId: String(row.productId),
			productName: String(row.productName),
			ratePlanCount: 1,
		})
		return acc
	}, [])
	const selectedVariant =
		variants.find((variant) => variant.variantId === String(input.variantId ?? "")) ??
		variants[0] ??
		null
	const monthStart = parseMonth(input.month ?? null)
	const baseDays = enumerateMonthDays(monthStart)
	const startDate = baseDays[0]?.date ?? toDateOnly(monthStart)
	const endDate = exclusiveEnd(baseDays)
	const vocabulary = await resolveVocabulary(rows)

	const inventoryRows = selectedVariant
		? await db
				.select({
					date: EffectiveAvailability.date,
					totalUnits: EffectiveAvailability.totalUnits,
					bookedUnits: EffectiveAvailability.bookedUnits,
					heldUnits: EffectiveAvailability.heldUnits,
					availableUnits: EffectiveAvailability.availableUnits,
					computedAt: EffectiveAvailability.computedAt,
				})
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, selectedVariant.variantId),
						gte(EffectiveAvailability.date, startDate),
						lt(EffectiveAvailability.date, endDate)
					)
				)
				.orderBy(asc(EffectiveAvailability.date))
				.all()
		: []
	const selectedVariantRatePlanIds = selectedVariant
		? rows
				.filter((row) => String(row.variantId) === selectedVariant.variantId)
				.map((row) => String(row.ratePlanId))
		: []
	const restrictionRows =
		selectedVariant && selectedVariantRatePlanIds.length > 0
			? await loadRestrictionSignalRows({
					variantId: selectedVariant.variantId,
					startDate,
					endDate,
				})
			: []
	const searchRows = selectedVariant
		? await loadSearchMaterializationRows({
				variantId: selectedVariant.variantId,
				startDate,
				endDate,
			})
		: []
	const byDate = new Map(inventoryRows.map((row) => [String(row.date), row]))
	const restrictionSignalsByDate = groupRestrictionSignals(restrictionRows)
	const days: InventoryCalendarDay[] = baseDays.map((day) => {
		const row = byDate.get(day.date)
		const hasInventory = Boolean(row)
		const totalUnits = Number(row?.totalUnits ?? 0)
		const availableUnits = Number(row?.availableUnits ?? 0)
		const status: InventoryCalendarDay["status"] = day.isPast
			? "past"
			: !hasInventory
				? "missing"
				: availableUnits <= 0
					? "sold_out"
					: availableUnits <= Math.max(1, Math.floor(totalUnits * 0.25))
						? "low"
						: "available"
		const utilizationPercent =
			hasInventory && totalUnits > 0
				? Math.round(((totalUnits - Math.max(0, availableUnits)) / totalUnits) * 100)
				: null
		return {
			...day,
			hasInventory,
			totalUnits,
			bookedUnits: Number(row?.bookedUnits ?? 0),
			heldUnits: Number(row?.heldUnits ?? 0),
			availableUnits,
			status,
			...resolveCapacitySignal(status),
			utilizationPercent,
			restrictionSignals: restrictionSignalsByDate.get(day.date) ?? emptyRestrictionSignals(),
		}
	})

	const expectedRows = activeDayCount(baseDays)
	const availabilityFreshness = evaluateMaterializationFreshness({
		label: "Inventario",
		expectedRows,
		timestamps: inventoryRows.map((row) => row.computedAt),
	})
	const restrictionFreshness = evaluateMaterializationFreshness({
		label: "Restricciones",
		expectedRows,
		timestamps: restrictionRows.map((row) => row.computedAt),
	})
	const searchFreshness = evaluateMaterializationFreshness({
		label: "Busqueda",
		expectedRows,
		timestamps: searchRows.map((row) => row.computedAt),
		delayedAfterMinutes: 45,
		staleAfterMinutes: 240,
	})
	const freshness = {
		availability: availabilityFreshness,
		restrictions: restrictionFreshness,
		search: searchFreshness,
		overall: summarizeMaterializationFreshness([
			availabilityFreshness,
			restrictionFreshness,
			searchFreshness,
		]),
	}

	return {
		rows,
		variants,
		selectedVariant,
		month: monthKey(monthStart),
		previousMonth: monthKey(addMonths(monthStart, -1)),
		nextMonth: monthKey(addMonths(monthStart, 1)),
		startDate,
		endDate,
		vocabulary,
		days,
		summary: summarize(days, "available"),
		freshness,
	}
}
