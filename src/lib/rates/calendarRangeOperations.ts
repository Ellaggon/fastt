export type CalendarRange = {
	from: string
	to: string
}

export type CalendarRangeDay = {
	date: string
	status?: string
	ruleAdjustment?: number | null
	availableUnits?: number
}

export function normalizeCalendarRange(first: string, second: string): CalendarRange {
	return first <= second ? { from: first, to: second } : { from: second, to: first }
}

export function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00.000Z`)
	value.setUTCDate(value.getUTCDate() + days)
	return value.toISOString().slice(0, 10)
}

export function countInclusiveDays(range: CalendarRange): number {
	const from = new Date(`${range.from}T00:00:00.000Z`)
	const to = new Date(`${range.to}T00:00:00.000Z`)
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return 0
	return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1
}

export function formatRangeLabel(range: CalendarRange): string {
	return range.from === range.to ? range.from : `${range.from} a ${range.to}`
}

export function summarizeRangeDays(days: CalendarRangeDay[], range: CalendarRange) {
	const selected = days.filter((day) => day.date >= range.from && day.date <= range.to)
	return {
		days: selected.length,
		missing: selected.filter((day) => day.status === "missing").length,
		adjusted: selected.filter((day) => Number(day.ruleAdjustment ?? 0) !== 0).length,
		soldOut: selected.filter((day) => day.status === "sold_out").length,
		low: selected.filter((day) => day.status === "low").length,
		totalAvailableUnits: selected.reduce(
			(sum, day) => sum + Math.max(0, Number(day.availableUnits ?? 0)),
			0
		),
	}
}

export type CalendarRangePreset =
	| "visible_week"
	| "visible_weekend"
	| "visible_month"
	| "next_7"
	| "next_30"

function parseDateOnly(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim())) return null
	const date = new Date(`${value}T00:00:00.000Z`)
	return Number.isNaN(date.getTime()) ? null : date
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10)
}

function clampRangeToVisible(range: CalendarRange, days: CalendarRangeDay[]): CalendarRange | null {
	const visibleDates = days
		.map((day) => day.date)
		.filter(Boolean)
		.sort()
	const first = visibleDates[0]
	const last = visibleDates[visibleDates.length - 1]
	if (!first || !last) return null
	const from = range.from < first ? first : range.from
	const to = range.to > last ? last : range.to
	return from <= to ? { from, to } : null
}

export function selectCalendarRangePreset(
	preset: CalendarRangePreset,
	days: CalendarRangeDay[]
): CalendarRange | null {
	const visibleDates = days
		.map((day) => day.date)
		.filter(Boolean)
		.sort()
	const first = visibleDates[0]
	const last = visibleDates[visibleDates.length - 1]
	if (!first || !last) return null

	if (preset === "visible_month") return { from: first, to: last }

	if (preset === "visible_week") {
		return clampRangeToVisible({ from: first, to: addDays(first, 6) }, days)
	}

	if (preset === "visible_weekend") {
		const weekend = visibleDates.filter((date) => {
			const parsed = parseDateOnly(date)
			if (!parsed) return false
			const day = parsed.getUTCDay()
			return day === 0 || day === 6
		})
		const firstWeekend = weekend[0]
		if (!firstWeekend) return null
		const parsed = parseDateOnly(firstWeekend)
		const to = parsed?.getUTCDay() === 6 ? addDays(firstWeekend, 1) : firstWeekend
		return clampRangeToVisible({ from: firstWeekend, to }, days)
	}

	const start = todayIso()
	const nights = preset === "next_30" ? 30 : 7
	return clampRangeToVisible({ from: start, to: addDays(start, nights - 1) }, days)
}

export function updateCalendarRangeHighlight(params: {
	cards: Element[]
	range: CalendarRange | null
	selectedClassNames?: string[]
}): void {
	const selectedClassNames = params.selectedClassNames ?? [
		"ring-2",
		"ring-blue-500",
		"ring-offset-2",
	]
	for (const card of params.cards) {
		const date = card.getAttribute("data-date")
		const selected =
			Boolean(params.range) &&
			Boolean(date) &&
			date! >= params.range!.from &&
			date! <= params.range!.to
		for (const className of selectedClassNames) {
			card.classList.toggle(className, selected)
		}
	}
}
