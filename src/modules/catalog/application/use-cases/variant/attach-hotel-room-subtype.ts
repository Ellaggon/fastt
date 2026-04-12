import type { VariantManagementRepositoryPort } from "../../ports/VariantManagementRepositoryPort"
import { attachHotelRoomSubtypeSchema } from "../../schemas/variant/variantSchemas"
import { ZodError } from "zod"

export async function attachHotelRoomSubtype(
	deps: { repo: VariantManagementRepositoryPort },
	params: { variantId: string; roomTypeId?: string | null }
): Promise<{ variantId: string }> {
	const parsed = attachHotelRoomSubtypeSchema.parse(params)
	const roomTypeId = String(parsed.roomTypeId ?? "").trim()

	const v = await deps.repo.getVariantById(parsed.variantId)
	if (!v) throw new Error("Variant not found")

	const kind = String(v.kind ?? v.entityType ?? "").trim()
	if (kind !== "hotel_room") {
		throw new ZodError([
			{
				code: "custom",
				path: ["variantId"],
				message: "variant_kind_mismatch",
			},
		])
	}

	const exists = await deps.repo.getHotelRoomSubtype(parsed.variantId)
	if (exists && roomTypeId) {
		throw new ZodError([
			{
				code: "custom",
				path: ["variantId"],
				message: "subtype_already_attached",
			},
		])
	}

	// CAPA 4.6 hardening:
	// Room type data can be absent in some environments.
	// Do not block the flow when roomTypeId is missing.
	if (!roomTypeId) {
		return { variantId: parsed.variantId }
	}

	const dup = await deps.repo.existsHotelRoomSubtypeForProductRoomType({
		productId: v.productId,
		roomTypeId,
	})
	if (dup) throw new Error("A hotel_room variant already exists for this roomTypeId")

	await deps.repo.attachHotelRoomSubtype({ variantId: parsed.variantId, roomTypeId })
	return { variantId: parsed.variantId }
}
