export function daysBetween(start: Date, end: Date): number {
	const ms = end.getTime() - start.getTime()
	return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function toISODate(date: Date): string {
	return date.toISOString().slice(0, 10)
}

export function fromISODate(date: string): Date {
	return new Date(date + "T00:00:00")
}

export function daysFromToday(date: Date): number {
	const today = new Date()
	const ms = date.getTime() - today.getTime()
	return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function getWeekday(date: Date): number {
	return date.getDay()
}