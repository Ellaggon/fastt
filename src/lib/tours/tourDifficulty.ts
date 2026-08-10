/**
 * Canonical tour difficulty levels for discovery filters + subtype storage.
 * UI may show Spanish labels; persistence and SQL filters use easy|moderate|hard.
 */

export const TOUR_DIFFICULTY_LEVELS = ["easy", "moderate", "hard"] as const
export type TourDifficultyLevel = (typeof TOUR_DIFFICULTY_LEVELS)[number]

export const TOUR_DIFFICULTY_OPTIONS: ReadonlyArray<{
	value: TourDifficultyLevel
	label: string
}> = [
	{ value: "easy", label: "Fácil" },
	{ value: "moderate", label: "Moderado" },
	{ value: "hard", label: "Difícil" },
]

const LABEL_BY_LEVEL: Record<TourDifficultyLevel, string> = {
	easy: "Fácil",
	moderate: "Moderado",
	hard: "Difícil",
}

/** Legacy / free-text aliases → canonical (accents stripped before lookup). */
const ALIAS_TO_CANONICAL: Record<string, TourDifficultyLevel> = {
	easy: "easy",
	facil: "easy",
	beginner: "easy",
	suave: "easy",
	moderate: "moderate",
	moderado: "moderate",
	medium: "moderate",
	medio: "moderate",
	intermediate: "moderate",
	hard: "hard",
	dificil: "hard",
	difficult: "hard",
	avanzado: "hard",
	advanced: "hard",
}

function stripDiacritics(value: string): string {
	return value.normalize("NFD").replace(/\p{M}/gu, "")
}

function aliasKey(raw: unknown): string {
	return stripDiacritics(
		String(raw ?? "")
			.trim()
			.toLowerCase()
	)
}

/** Normalize UI/DB input to a canonical level, or null when empty/unknown. */
export function normalizeTourDifficulty(raw: unknown): TourDifficultyLevel | null {
	const key = aliasKey(raw)
	if (!key) return null
	return ALIAS_TO_CANONICAL[key] ?? null
}

/** Persist-safe value: canonical level or null (unknown free-text is dropped). */
export function canonicalizeTourDifficultyForStorage(raw: unknown): TourDifficultyLevel | null {
	return normalizeTourDifficulty(raw)
}

/** Spanish label for cards/PDP; falls back to trimmed raw when unknown. */
export function tourDifficultyLabel(raw: unknown): string {
	const canonical = normalizeTourDifficulty(raw)
	if (canonical) return LABEL_BY_LEVEL[canonical]
	return String(raw ?? "").trim()
}

/**
 * Stored values that should match a canonical filter (includes Spanish legacy rows).
 * Used so discovery keeps working before every row is rewritten.
 */
export function tourDifficultyMatchValues(canonical: TourDifficultyLevel): string[] {
	const values = new Set<string>([canonical])
	for (const [alias, level] of Object.entries(ALIAS_TO_CANONICAL)) {
		if (level !== canonical) continue
		values.add(alias)
		if (alias === "facil") values.add("fácil")
		if (alias === "dificil") values.add("difícil")
	}
	return [...values]
}
