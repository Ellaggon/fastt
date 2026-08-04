import {
	buildPricingCalendarSurface,
	resolvePricingCalendarScope,
	type PricingCalendarDay,
} from "@/lib/rates/calendarSurfaces"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
import {
	listProviderExternalCalendarOverlay,
	type ProviderExternalCalendarDayOverlay,
} from "@/lib/provider-external-calendars"
import type { RatePlanListItem } from "@/lib/rates/loadRatePlansReadModel"
import type { ServerTimingRecorder } from "@/lib/observability/serverTiming"
import { summarizeMissingPolicyCategories } from "@/modules/policies/public"

export type SingleCalendarDay = PricingCalendarDay & {
	conditionsComplete: boolean
	conditionsSummary: string
	conditionsMissingSummary: string
	externalCalendar: ProviderExternalCalendarDayOverlay | null
}

export type SingleCalendarSurface = {
	month: string
	previousMonth: string
	nextMonth: string
	leadingBlankDays: number
	selectedRatePlanId: string
	selectedVariantId: string
	selectedRatePlanName: string
	selectedContext: string
	conditions: {
		complete: boolean
		summary: string
		missingSummary: string
		missingCategories: string[]
	}
	ratePlans: Array<{
		id: string
		name: string
		context: string
	}>
	days: SingleCalendarDay[]
}

export async function buildSingleCalendarSurface(input: {
	rows: RatePlanListItem[]
	providerId?: string | null
	ratePlanId?: string | null
	variantId?: string | null
	month?: string | null
	externalCalendarOverlay?: ProviderExternalCalendarDayOverlay[]
	timing?: ServerTimingRecorder
}): Promise<SingleCalendarSurface> {
	const pricingInput = {
		rows: input.rows,
		ratePlanId: input.ratePlanId,
		variantId: input.variantId,
		month: input.month,
		visibleMonths: 1,
		timing: input.timing,
	}
	const scope = resolvePricingCalendarScope(pricingInput)
	const loadOverlay = () =>
		input.externalCalendarOverlay !== undefined
			? Promise.resolve(input.externalCalendarOverlay)
			: input.providerId && scope.selectedRatePlan?.variantId
				? listProviderExternalCalendarOverlay({
						providerId: input.providerId,
						variantId: String(scope.selectedRatePlan.variantId),
						from: scope.startDate,
						toExclusive: scope.endDate,
					})
				: Promise.resolve([])
	const overlayPromise = input.timing ? input.timing.time("ical", loadOverlay) : loadOverlay()
	const [pricing, externalCalendarOverlay] = await Promise.all([
		buildPricingCalendarSurface(pricingInput),
		overlayPromise,
	])
	const selected = pricing.selectedRatePlan
	const missingCategories = selected?.policyCoverage?.missingCategories ?? []
	const complete = Boolean(selected?.policyCoverage?.isComplete)
	const conditionsSummary =
		missingCategories.length >= 4
			? "Sin condiciones configuradas"
			: String(selected?.policySummary ?? "").trim() ||
				(complete ? "Contrato completo" : summarizeMissingPolicyCategories(missingCategories))
	const conditionsMissingSummary = summarizeMissingPolicyCategories(missingCategories)
	const firstDay = pricing.days[0]?.date
	const externalCalendarByDate = new Map(externalCalendarOverlay.map((day) => [day.date, day]))

	return {
		month: pricing.month,
		previousMonth: pricing.previousMonth,
		nextMonth: pricing.nextMonth,
		leadingBlankDays: firstDay ? (new Date(`${firstDay}T12:00:00.000Z`).getUTCDay() + 6) % 7 : 0,
		selectedRatePlanId: String(selected?.ratePlanId ?? ""),
		selectedVariantId: String(selected?.variantId ?? ""),
		selectedRatePlanName: String(selected?.ratePlanName ?? ""),
		selectedContext: selected
			? `${selected.productName} · ${selected.variantName}`
			: "Sin tarifa seleccionada",
		conditions: {
			complete,
			summary: conditionsSummary,
			missingSummary: conditionsMissingSummary,
			missingCategories,
		},
		ratePlans: input.rows.map((row) => ({
			id: String(row.ratePlanId),
			name: String(row.ratePlanName),
			context: `${row.productName} · ${row.variantName}`,
		})),
		days: pricing.days.map((day) => ({
			...day,
			conditionsComplete: complete,
			conditionsSummary,
			conditionsMissingSummary,
			externalCalendar: externalCalendarByDate.get(day.date) ?? null,
		})),
	}
}

export async function loadSingleCalendarSurface(input: {
	rows: RatePlanListItem[]
	providerId: string
	ratePlanId?: string | null
	variantId?: string | null
	month?: string | null
	timing?: ServerTimingRecorder
}): Promise<SingleCalendarSurface> {
	const scope = resolvePricingCalendarScope({
		rows: input.rows,
		ratePlanId: input.ratePlanId,
		variantId: input.variantId,
		month: input.month,
		visibleMonths: 1,
	})
	const selected = scope.selectedRatePlan
	const key = cacheKeys.calendarSurface(
		input.providerId,
		String(selected?.ratePlanId ?? "none"),
		String(selected?.variantId ?? "none"),
		scope.monthStart.toISOString().slice(0, 7)
	)

	const metricStart = input.timing?.metrics.length ?? 0
	const surface = await readThrough(key, cacheTtls.calendarSurface, () =>
		buildSingleCalendarSurface(input)
	)
	if (input.timing) {
		const recorded = new Set(input.timing.metrics.slice(metricStart).map((metric) => metric.name))
		for (const name of ["pricing", "inventory", "restrictions", "searchFreshness", "ical"]) {
			if (!recorded.has(name)) input.timing.add(name, 0, "calendar_surface_cache_hit")
		}
	}
	return surface
}
