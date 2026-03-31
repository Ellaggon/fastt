import { z } from "zod"

export const variantKindSchema = z.enum(["hotel_room", "tour_slot", "package_base"])
export const variantLifecycleStatusSchema = z.enum(["draft", "ready", "sellable", "archived"])

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
	roomTypeId: z.string().trim().min(1),
})

export const evaluateVariantReadinessSchema = z.object({
	variantId: z.string().trim().min(1),
})

export const updateVariantStatusSchema = z.object({
	variantId: z.string().trim().min(1),
	status: variantLifecycleStatusSchema,
})
