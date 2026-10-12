import {
	experienceDurationLabel,
	experienceDurationMinutes,
} from "@/shared/domain/experience-duration"
import { experienceProgramLines } from "@/shared/domain/experience-format"
import { canonicalizeTourDifficultyForStorage } from "@/lib/tours/tourDifficulty"
import { parseDurationMinutes } from "@/lib/tours/tourSemantics"
import type { TourPayload } from "../infrastructure/repositories/SubtypeRepository"

/** Omitted controls preserve data; an explicitly empty control removes its value. */
export function tourProgramPatch(
	form: FormData,
	current: Record<string, unknown>
): Partial<TourPayload> {
	const patch: Partial<TourPayload> = {}
	const text = (name: string) => String(form.get(name) ?? "").trim()
	const list = (name: string) =>
		text(name)
			.split(/\r?\n|,/)
			.map((item) => item.trim())
			.filter(Boolean)
	if (form.has("duration")) patch.duration = text("duration") || null
	if (form.has("durationMinutes"))
		patch.durationMinutes = text("durationMinutes") ? Number(text("durationMinutes")) : null
	else if (form.has("duration")) patch.durationMinutes = parseDurationMinutes(text("duration"))
	if (form.has("durationHours") || form.has("durationPartMinutes")) {
		patch.durationMinutes = experienceDurationMinutes(
			form.get("durationHours"),
			form.get("durationPartMinutes")
		)
		patch.duration = form.has("durationCustomEnabled")
			? text("duration") || null
			: experienceDurationLabel(patch.durationMinutes)
	}
	if (form.has("difficultyLevel"))
		patch.difficultyLevel = canonicalizeTourDifficultyForStorage(form.get("difficultyLevel"))
	if (form.has("tourItinerary"))
		patch.itineraryJson = experienceProgramLines(form.get("tourItinerary")).map(
			(description, index) => ({ step: index + 1, description })
		)
	if (form.has("tourIncludes")) patch.includesJson = list("tourIncludes")
	if (form.has("tourExcludes")) patch.excludesJson = list("tourExcludes")
	const objects = {
		meetingPointJson: { address: "meetingPointAddress", instructions: "meetingPointInstructions" },
		safetyJson: { requirements: "safetyRequirements", warnings: "safetyWarnings" },
		guideJson: { languages: "guideLanguages", guideType: "guideType" },
		pickupJson: { defaultArea: "pickupDefaultArea", instructions: "pickupInstructions" },
	} as const
	for (const [column, fields] of Object.entries(objects)) {
		if (!Object.values(fields).some((name) => form.has(name))) continue
		const existing = current[column]
		const value: Record<string, unknown> =
			existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {}
		for (const [key, name] of Object.entries(fields)) {
			if (!form.has(name)) continue
			const edited = key === "languages" ? list(name).join(", ") : text(name)
			if (edited) value[key] = edited
			else delete value[key]
		}
		patch[column as keyof typeof objects] = Object.keys(value).length ? value : null
	}
	return patch
}
