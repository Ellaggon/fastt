import { z } from "zod"
import { normalizeProductVertical } from "@/lib/productVerticalRegistry"

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

export const tourSchema = z.object({
	productId: z.string().min(1),
	productType: z.literal("tour"),
	duration: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	difficultyLevel: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
	meetingPointJson: z.unknown().optional().nullable(),
	itineraryJson: z.unknown().optional().nullable(),
	safetyJson: z.unknown().optional().nullable(),
	guideJson: z.unknown().optional().nullable(),
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
