export function daysBetween(start: Date, end: Date): number {
	const ms = end.getTime() - start.getTime()
	return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function normalize(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysFromToday(date: Date): number {
	const today = normalize(new Date())
	const target = normalize(date)
	const ms = target.getTime() - today.getTime()
	return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function getWeekday(date: Date): number {
	// 0 = Sunday, 1 = Monday...
	return date.getDay()
}
