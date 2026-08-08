/**
 * Zoned local datetime helpers for policy/refund deadlines.
 * Format: `YYYY-MM-DDTHH:mm:ss[Area/City]` (Temporal-style calendar annotation).
 *
 * Uses Intl offset resolution (no Temporal polyfill required). Fixed-offset and
 * DST zones are supported via two-pass wall-clock → UTC conversion.
 */

const ZONED_LOCAL_RE =
	/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\[([^\]]+)\]$/

function pad2(value: number): string {
	return String(value).padStart(2, "0")
}

export function isValidIanaTimeZone(timeZone: string): boolean {
	const tz = String(timeZone ?? "").trim()
	if (!tz) return false
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date())
		return true
	} catch {
		return false
	}
}

function zonedParts(
	utcMs: number,
	timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(new Date(utcMs))
	const byType = new Map(parts.map((part) => [part.type, part.value]))
	let hour = Number(byType.get("hour") ?? 0)
	// Some engines emit "24" for midnight.
	if (hour === 24) hour = 0
	return {
		year: Number(byType.get("year")),
		month: Number(byType.get("month")),
		day: Number(byType.get("day")),
		hour,
		minute: Number(byType.get("minute") ?? 0),
		second: Number(byType.get("second") ?? 0),
	}
}

/** Offset such that localWallAsUtcMs = utcMs + offsetMs. */
function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
	const local = zonedParts(utcMs, timeZone)
	const asUtc = Date.UTC(
		local.year,
		local.month - 1,
		local.day,
		local.hour,
		local.minute,
		local.second
	)
	return asUtc - utcMs
}

function normalizeTimeHms(time: string): string {
	const raw = String(time ?? "").trim()
	if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`
	if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw
	return "00:00:00"
}

/** Convert a wall-clock local datetime in `timeZone` to a UTC epoch ms. */
export function zonedWallTimeToUtcMs(params: {
	dateOnly: string
	time?: string | null
	timeZone: string
}): number {
	const dateOnly = String(params.dateOnly ?? "").slice(0, 10)
	const timeZone = String(params.timeZone ?? "").trim()
	const time = normalizeTimeHms(params.time ?? "00:00:00")
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) || !isValidIanaTimeZone(timeZone)) {
		return Number.NaN
	}
	const [year, month, day] = dateOnly.split("-").map(Number)
	const [hour, minute, second] = time.split(":").map(Number)
	const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second || 0)
	// Two-pass refinement handles DST transitions.
	let utcMs = wallAsUtc - timeZoneOffsetMs(timeZone, wallAsUtc)
	utcMs = wallAsUtc - timeZoneOffsetMs(timeZone, utcMs)
	return utcMs
}

/** Format a UTC instant as `YYYY-MM-DDTHH:mm:ss[timeZone]` in the given zone. */
export function formatZonedLocalDateTime(utcMs: number, timeZone: string): string {
	const tz = String(timeZone ?? "").trim()
	if (!Number.isFinite(utcMs) || !isValidIanaTimeZone(tz)) {
		const d = new Date(utcMs)
		return `${d.toISOString().slice(0, 19)}[UTC]`
	}
	const local = zonedParts(utcMs, tz)
	return `${local.year}-${pad2(local.month)}-${pad2(local.day)}T${pad2(local.hour)}:${pad2(local.minute)}:${pad2(local.second)}[${tz}]`
}

/**
 * Parse deadline strings used in policy/refund snapshots.
 * Supports:
 * - `YYYY-MM-DDTHH:mm:ss[Area/City]`
 * - plain ISO / `...Z`
 */
export function zonedLocalDateTimeToUtcMs(value: string | null | undefined): number {
	const raw = String(value ?? "").trim()
	if (!raw) return Number.NaN

	const zoned = raw.match(ZONED_LOCAL_RE)
	if (zoned) {
		const dateOnly = zoned[1]
		const time = normalizeTimeHms(zoned[2])
		const timeZone = zoned[3]
		if (!isValidIanaTimeZone(timeZone)) {
			// Non-IANA annotations (e.g. property_local): treat wall clock as UTC.
			return new Date(`${dateOnly}T${time}.000Z`).getTime()
		}
		return zonedWallTimeToUtcMs({ dateOnly, time, timeZone })
	}

	const time = new Date(raw).getTime()
	return Number.isFinite(time) ? time : Number.NaN
}
