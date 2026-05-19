import {
	and,
	asc,
	db,
	desc,
	EffectiveAvailability,
	EffectivePricingV2,
	eq,
	gte,
	inArray,
	lt,
	Product,
	RatePlanOccupancyPolicy,
} from "astro:db"

import type { RatePlanListItem } from "@/lib/rates/loadRatePlansReadModel"
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

export type PricingCalendarDay = CalendarDay & {
	hasPrice: boolean
	finalPrice: number | null
	currency: string
	baseComponent: number | null
	ruleAdjustment: number | null
	status: "priced" | "missing" | "past"
}

export type InventoryCalendarDay = CalendarDay & {
	hasInventory: boolean
	totalUnits: number
	bookedUnits: number
	heldUnits: number
	availableUnits: number
	status: "available" | "low" | "sold_out" | "missing" | "past"
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
}): Promise<PricingCalendarSurface> {
	const rows = input.rows
	const selectedRatePlan =
		rows.find((row) => String(row.ratePlanId) === String(input.ratePlanId ?? "")) ??
		rows.find((row) => row.isDefault && row.isActive) ??
		rows.find((row) => row.isActive) ??
		rows[0] ??
		null
	const monthStart = parseMonth(input.month ?? null)
	const baseDays = enumerateMonthDays(monthStart)
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
	const byDate = new Map(pricingRows.map((row) => [String(row.date), row]))
	const days: PricingCalendarDay[] = baseDays.map((day) => {
		const row = byDate.get(day.date)
		const hasPrice = row?.finalPrice != null
		return {
			...day,
			hasPrice,
			finalPrice: hasPrice ? Number(row?.finalPrice ?? 0) : null,
			currency: String(row?.currency ?? baseline.currency),
			baseComponent: row?.baseComponent == null ? null : Number(row.baseComponent),
			ruleAdjustment: row?.ruleAdjustment == null ? null : Number(row.ruleAdjustment),
			status: day.isPast ? "past" : hasPrice ? "priced" : "missing",
		}
	})

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
	const byDate = new Map(inventoryRows.map((row) => [String(row.date), row]))
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
		return {
			...day,
			hasInventory,
			totalUnits,
			bookedUnits: Number(row?.bookedUnits ?? 0),
			heldUnits: Number(row?.heldUnits ?? 0),
			availableUnits,
			status,
		}
	})

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
	}
}
