import { z } from "zod"

/**
 * Normalizaciones por formulario (strings -> números/arrays/nulls)
 * Usamos preprocess para limpiar entradas vacías.
 */

export const hotelSchema = z.object({
	productId: z.string().min(1),
	productType: z.literal("hotel"),
	stars: z.preprocess((v) => {
		if (v === null || v === undefined || v === "") return undefined
		const n = Number(v)
		return Number.isFinite(n) ? n : undefined
	}, z.number().int().min(1).max(5).optional()),
	address: z.preprocess((v) => (v === "" ? null : v), z.string().min(1).optional().nullable()),
	phone: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	email: z.preprocess((v) => (v === "" ? null : v), z.string().email().optional().nullable()),
	website: z.preprocess((v) => (v === "" ? null : v), z.string().url().optional().nullable()),
	checkInTime: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	checkOutTime: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
})

export const tourSchema = z.object({
	productId: z.string().min(1),
	productType: z.literal("tour"),
	duration: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	difficultyLevel: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	guideLanguages: z.preprocess((v) => {
		if (!v) return undefined
		return String(v)
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
	}, z.array(z.string()).optional()),
	includes: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	excludes: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
})

export const packageSchema = z.object({
	productId: z.string().min(1),
	productType: z.literal("package"),
	itinerary: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	days: z.preprocess((v) => {
		if (v === null || v === undefined || v === "") return undefined
		const n = Number(v)
		return Number.isFinite(n) ? n : undefined
	}, z.number().int().min(0).optional()),
	nights: z.preprocess((v) => {
		if (v === null || v === undefined || v === "") return undefined
		const n = Number(v)
		return Number.isFinite(n) ? n : undefined
	}, z.number().int().min(0).optional()),
})

/** helper simple para normalizar productType del form */
export function normalizeProductType(raw: unknown): "hotel" | "tour" | "package" | "unknown" {
	if (!raw) return "unknown"
	const s = String(raw || "")
		.trim()
		.toLowerCase()
	if (s === "hotel") return "hotel"
	if (s === "tour") return "tour"
	if (s === "package") return "package"
	return "unknown"
}
