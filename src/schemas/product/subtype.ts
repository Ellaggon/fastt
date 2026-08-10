import { z } from "zod"
import { normalizeProductVertical } from "@/lib/productVerticalRegistry"
import { canonicalizeTourDifficultyForStorage } from "@/lib/tours/tourDifficulty"

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
	phone: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	email: z.preprocess((v) => (v === "" ? null : v), z.string().email().optional().nullable()),
	website: z.preprocess((v) => (v === "" ? null : v), z.string().url().optional().nullable()),
})

const tourMeetingPointSchema = z
	.object({
		address: z.string().trim().min(1, "Indica el punto de encuentro."),
		instructions: z.string().trim().optional(),
	})
	.passthrough()

const tourItineraryStepSchema = z
	.object({
		step: z.number().int().positive(),
		description: z.string().trim().min(1),
	})
	.passthrough()

export const tourSchema = z.object({
	productId: z.string().min(1),
	productType: z.literal("tour"),
	duration: z.string().trim().min(1, "Indica la duración del tour."),
	durationMinutes: z.preprocess((v) => {
		if (v === null || v === undefined || v === "") return undefined
		const n = Number(v)
		return Number.isFinite(n) ? n : undefined
	}, z.number().int().positive("La duración debe ser mayor que cero.")),
	difficultyLevel: z.preprocess(
		(v) => {
			if (v === "" || v == null) return null
			return canonicalizeTourDifficultyForStorage(v)
		},
		z.enum(["easy", "moderate", "hard"]).optional().nullable()
	),
	meetingPointJson: tourMeetingPointSchema,
	itineraryJson: z
		.array(tourItineraryStepSchema)
		.min(3, "Agrega al menos 3 paradas o momentos al itinerario."),
	safetyJson: z.unknown().optional().nullable(),
	guideJson: z.unknown().optional().nullable(),
	includesJson: z.array(z.string().trim().min(1)).min(1, "Agrega al menos una inclusión."),
	excludesJson: z.unknown().optional().nullable(),
	categoriesJson: z.unknown().optional().nullable(),
	pickupJson: z.unknown().optional().nullable(),
})

export const packageSchema = z.object({
	productId: z.string().min(1),
	productType: z.literal("package"),
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
	itineraryJson: z.unknown().optional().nullable(),
	includesJson: z.unknown().optional().nullable(),
	excludesJson: z.unknown().optional().nullable(),
})

export const limousineSchema = z.object({
	productId: z.string().min(1),
	productType: z.literal("limousine"),
	vehicleProfileJson: z.unknown().optional().nullable(),
	pickupJson: z.unknown().optional().nullable(),
	dropoffJson: z.unknown().optional().nullable(),
	passengerCapacity: z.preprocess((v) => {
		if (v === null || v === undefined || v === "") return undefined
		const n = Number(v)
		return Number.isFinite(n) ? n : undefined
	}, z.number().int().min(0).optional()),
	luggageCapacity: z.preprocess((v) => {
		if (v === null || v === undefined || v === "") return undefined
		const n = Number(v)
		return Number.isFinite(n) ? n : undefined
	}, z.number().int().min(0).optional()),
})

/** helper simple para normalizar productType del form */
export function normalizeProductType(
	raw: unknown
): "hotel" | "tour" | "package" | "limousine" | "unknown" {
	return normalizeProductVertical(raw) ?? "unknown"
}
