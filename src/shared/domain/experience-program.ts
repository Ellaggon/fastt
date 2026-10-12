import { experienceProgramMinimum } from "./experience-format"

/** Saved programs may contain legacy strings or titled moments; empty records are not content. */
export function experienceProgramMoments(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value
		.map((item) => {
			if (typeof item === "string") return item.trim()
			if (!item || typeof item !== "object") return ""
			const row = item as Record<string, unknown>
			return (
				[row.description, row.title]
					.find((text) => typeof text === "string" && Boolean(text.trim()))
					?.toString()
					.trim() ?? ""
			)
		})
		.filter(Boolean)
}
export function experienceProgramMomentCount(value: unknown): number {
	return experienceProgramMoments(value).length
}

export function experienceHasInclusions(value: unknown): boolean {
	return (
		Array.isArray(value) && value.some((item) => typeof item === "string" && Boolean(item.trim()))
	)
}

export function experienceHasMeetingPoint(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false
	const row = value as Record<string, unknown>
	if (
		[row.address, row.label, row.name].some(
			(text) => typeof text === "string" && Boolean(text.trim())
		)
	)
		return true
	const lat = row.lat ?? row.latitude,
		lng = row.lng ?? row.longitude
	if (lat == null || lng == null || lat === "" || lng === "") return false
	return (
		Number.isFinite(Number(lat)) &&
		Number.isFinite(Number(lng)) &&
		Math.abs(Number(lat)) <= 90 &&
		Math.abs(Number(lng)) <= 180
	)
}

export function experienceHasDuration(value: unknown): boolean {
	return Number.isInteger(Number(value)) && Number(value) > 0
}

export function evaluateExperienceProgram(input: {
	experienceFormat?: unknown
	durationMinutes?: unknown
	meetingPoint?: unknown
	itinerary?: unknown
	includes?: unknown
}) {
	const momentCount = experienceProgramMomentCount(input.itinerary)
	const minimum = experienceProgramMinimum(input.experienceFormat)
	const checks = {
		duration: experienceHasDuration(input.durationMinutes),
		meetingPoint: experienceHasMeetingPoint(input.meetingPoint),
		includes: experienceHasInclusions(input.includes),
		program: momentCount >= minimum,
	}
	return {
		checks,
		momentCount,
		minimum,
		programComplete: checks.duration && checks.includes && checks.program,
		complete: Object.values(checks).every(Boolean),
	}
}
