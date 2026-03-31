import type { VariantManagementRepositoryPort } from "../../ports/VariantManagementRepositoryPort"
import { setCapacitySchema } from "../../schemas/variant/variantSchemas"

export async function setVariantCapacity(
	deps: { repo: VariantManagementRepositoryPort },
	params: {
		variantId: string
		minOccupancy: number
		maxOccupancy: number
		maxAdults?: number | null
		maxChildren?: number | null
	}
): Promise<{ variantId: string }> {
	const parsed = setCapacitySchema.parse({
		variantId: params.variantId,
		minOccupancy: params.minOccupancy,
		maxOccupancy: params.maxOccupancy,
		maxAdults: params.maxAdults ?? undefined,
		maxChildren: params.maxChildren ?? undefined,
	})

	if (parsed.minOccupancy > parsed.maxOccupancy) {
		throw new Error("Invalid occupancy: minOccupancy cannot exceed maxOccupancy")
	}
	if (parsed.maxAdults !== undefined && parsed.maxAdults > parsed.maxOccupancy) {
		throw new Error("Invalid occupancy: maxAdults cannot exceed maxOccupancy")
	}
	if (parsed.maxChildren !== undefined && parsed.maxChildren > parsed.maxOccupancy) {
		throw new Error("Invalid occupancy: maxChildren cannot exceed maxOccupancy")
	}

	const v = await deps.repo.getVariantById(parsed.variantId)
	if (!v) throw new Error("Variant not found")

	await deps.repo.upsertCapacity({
		variantId: parsed.variantId,
		minOccupancy: parsed.minOccupancy,
		maxOccupancy: parsed.maxOccupancy,
		maxAdults: parsed.maxAdults ?? null,
		maxChildren: parsed.maxChildren ?? null,
	})

	return { variantId: parsed.variantId }
}
