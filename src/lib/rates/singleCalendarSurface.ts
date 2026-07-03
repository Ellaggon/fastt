import { buildPricingCalendarSurface, type PricingCalendarDay } from "@/lib/rates/calendarSurfaces"
import type { RatePlanListItem } from "@/lib/rates/loadRatePlansReadModel"
import { summarizeMissingPolicyCategories } from "@/modules/policies/public"

export type SingleCalendarDay = PricingCalendarDay & {
	conditionsComplete: boolean
	conditionsSummary: string
	conditionsMissingSummary: string
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
	ratePlanId?: string | null
	variantId?: string | null
	month?: string | null
}): Promise<SingleCalendarSurface> {
	const pricing = await buildPricingCalendarSurface({
		rows: input.rows,
		ratePlanId: input.ratePlanId,
		variantId: input.variantId,
		month: input.month,
		visibleMonths: 1,
	})
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
		})),
	}
}
