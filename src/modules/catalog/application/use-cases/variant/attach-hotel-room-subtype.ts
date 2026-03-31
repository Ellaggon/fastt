import type { VariantManagementRepositoryPort } from "../../ports/VariantManagementRepositoryPort"
import { attachHotelRoomSubtypeSchema } from "../../schemas/variant/variantSchemas"
import { ZodError } from "zod"

export async function attachHotelRoomSubtype(
	deps: { repo: VariantManagementRepositoryPort },
	params: { variantId: string; roomTypeId: string }
): Promise<{ variantId: string }> {
	const parsed = attachHotelRoomSubtypeSchema.parse(params)

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
	if (exists) {
		throw new ZodError([
			{
				code: "custom",
				path: ["variantId"],
				message: "subtype_already_attached",
			},
		])
	}

	const dup = await deps.repo.existsHotelRoomSubtypeForProductRoomType({
		productId: v.productId,
		roomTypeId: parsed.roomTypeId,
	})
	if (dup) throw new Error("A hotel_room variant already exists for this roomTypeId")

	await deps.repo.attachHotelRoomSubtype(parsed)
	return { variantId: parsed.variantId }
}
