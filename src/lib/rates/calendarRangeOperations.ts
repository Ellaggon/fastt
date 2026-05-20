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
