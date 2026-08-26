import { z } from "zod"

export const variantKindSchema = z.enum([
	"hotel_room",
	"tour_slot",
	"package_base",
	"limousine_service",
])
export const variantLifecycleStateSchema = z.enum(["draft", "ready", "archived"])

export const createVariantSchema = z.object({
	productId: z.string().trim().min(1),
	name: z.string().trim().min(1),
	description: z.string().trim().optional(),
	kind: variantKindSchema,
})

export const setCapacitySchema = z.object({
	variantId: z.string().trim().min(1),
	minOccupancy: z.number().int().min(0),
	maxOccupancy: z.number().int().min(0),
	maxAdults: z.number().int().min(0).optional(),
	maxChildren: z.number().int().min(0).optional(),
})

export const attachHotelRoomSubtypeSchema = z.object({
	variantId: z.string().trim().min(1),
	roomTypeId: z.string().trim().optional(),
})

export const evaluateVariantReadinessSchema = z.object({
	variantId: z.string().trim().min(1),
})

export const updateVariantLifecycleSchema = z.object({
	variantId: z.string().trim().min(1),
	lifecycleState: variantLifecycleStateSchema,
})

export const setVariantSalesEnabledSchema = z.object({
	variantId: z.string().trim().min(1),
	salesEnabled: z.boolean(),
})
