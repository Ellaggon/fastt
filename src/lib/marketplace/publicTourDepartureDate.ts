export function todayInBolivia(now = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/La_Paz",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now)
}

/**
 * A destination landing without a date means the traveler just chose a place,
 * so the departure defaults to today in Bolivia. An explicit empty `startDate`
 * or `checkin` means they cleared it and must stay empty.
 */
export function resolveDestinationTourDepartureDate(
	searchParams: Pick<URLSearchParams, "has" | "get">,
	today = todayInBolivia()
): string {
	if (searchParams.has("startDate")) return searchParams.get("startDate") ?? ""
	if (searchParams.has("checkin")) return searchParams.get("checkin") ?? ""
	return today
}
