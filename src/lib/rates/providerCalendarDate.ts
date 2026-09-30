/** Format a calendar day without inheriting the browser's timezone. */
export function providerCalendarDate(
	timezone: string | null | undefined,
	now = new Date()
): string {
	const parts = new Intl.DateTimeFormat("en", {
		timeZone: timezone?.trim() || "UTC",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now)
	const value = (type: string) => parts.find((part) => part.type === type)?.value
	return `${value("year")}-${value("month")}-${value("day")}`
}
