import type { TourDurationBucket } from "@/lib/tours/tourSemantics"

type RawCategory = { id: string; slug: string; name: string }

const TECHNICAL_SUFFIX = /(?:^|[-_])[a-f0-9]{8}(?:[-_a-f0-9]{0,28})$/i
const NON_PUBLIC_WORD = /(?:^|[-_\s])(test|fixture|qa|demo|seed)(?:$|[-_\s])/i

const CATEGORY_LABELS: Record<string, string> = {
	"adventure": "Aventura",
	"cultural": "Cultura y patrimonio",
	"gastronomy": "Gastronomía",
	"nature": "Naturaleza",
	"trekking": "Trekking",
	"wildlife": "Vida silvestre",
	"water-activities": "Actividades acuáticas",
}

function normalizedKey(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLowerCase()
}

/** Never expose generated, seed, or QA taxonomy values in the traveller UI. */
export function isPublicTourCategory(category: Pick<RawCategory, "slug" | "name">): boolean {
	const slug = String(category.slug ?? "").trim()
	const name = String(category.name ?? "").trim()
	if (!slug || !name || name.length > 70 || slug.length > 80) return false
	if (TECHNICAL_SUFFIX.test(slug) || TECHNICAL_SUFFIX.test(name)) return false
	if (NON_PUBLIC_WORD.test(slug) || NON_PUBLIC_WORD.test(name)) return false
	return true
}

export function publicTourCategoryLabel(category: Pick<RawCategory, "slug" | "name">): string {
	const canonical = normalizedKey(category.slug)
	if (CATEGORY_LABELS[canonical]) return CATEGORY_LABELS[canonical]
	const name = String(category.name).trim()
	if (normalizedKey(name) !== canonical || !/^[a-z0-9-]+$/i.test(name)) return name
	return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("es-BO"))
}

/** Filters and de-duplicates persisted taxonomy before it reaches a public form. */
export function publicTourCategories(categories: RawCategory[]): RawCategory[] {
	const seen = new Set<string>()
	return categories.flatMap((category) => {
		if (!isPublicTourCategory(category)) return []
		const name = publicTourCategoryLabel(category)
		const key = normalizedKey(name)
		if (seen.has(key)) return []
		seen.add(key)
		return [{ ...category, name }]
	})
}

export type TourPriceInput = { value: number | null; invalid: boolean }

/** Empty is intentionally absent; explicit zero remains a valid price bound. */
export function parseTourPriceInput(raw: string | null | undefined): TourPriceInput {
	const value = String(raw ?? "").trim()
	if (!value) return { value: null, invalid: false }
	const parsed = Number(value)
	if (!Number.isFinite(parsed) || parsed < 0) return { value: null, invalid: true }
	return { value: parsed, invalid: false }
}

export function hasInvalidTourPriceRange(min: TourPriceInput, max: TourPriceInput): boolean {
	return (
		min.invalid || max.invalid || (min.value != null && max.value != null && min.value > max.value)
	)
}

export function isValidTourSearchDate(value: string | null | undefined): boolean {
	const raw = String(value ?? "").trim()
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
	const parsed = new Date(`${raw}T00:00:00.000Z`)
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw
}

export function isTourDurationBucket(
	value: string | null | undefined
): value is TourDurationBucket {
	return ["up_to_4h", "four_to_eight_hours", "full_day", "multi_day"].includes(String(value ?? ""))
}
