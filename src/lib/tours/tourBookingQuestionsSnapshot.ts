export type TourBookingQuestionSnapshot = {
	id: string
	code: string
	label: string
	required: boolean
}

export function readTourBookingQuestionSnapshot(
	value: unknown
): TourBookingQuestionSnapshot[] | null {
	if (!value || typeof value !== "object") return null
	const raw = (value as { tourBookingQuestions?: unknown }).tourBookingQuestions
	if (!Array.isArray(raw)) return null

	const questions: TourBookingQuestionSnapshot[] = []
	const ids = new Set<string>()
	for (const item of raw) {
		if (!item || typeof item !== "object") return null
		const row = item as Record<string, unknown>
		const id = String(row.id ?? "").trim()
		const code = String(row.code ?? "").trim()
		const label = String(row.label ?? "").trim()
		if (!id || !code || !label || ids.has(id)) return null
		ids.add(id)
		questions.push({ id, code, label, required: Boolean(row.required) })
	}
	return questions
}
