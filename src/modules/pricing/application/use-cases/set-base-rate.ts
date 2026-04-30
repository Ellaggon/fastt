import type { BaseRateRepositoryPort } from "../ports/BaseRateRepositoryPort"
import type { VariantRepositoryPort } from "../ports/VariantRepositoryPort"
import { setBaseRateSchema } from "../schemas/base-rate.schemas"

export async function setBaseRate(
	deps: { baseRateRepo: BaseRateRepositoryPort; variantRepo: VariantRepositoryPort },
	params: { variantId: string; currency: string; basePrice: number }
): Promise<{ variantId: string }> {
	const parsed = setBaseRateSchema.parse({
		variantId: params.variantId,
		currency: params.currency,
		basePrice: params.basePrice,
	})

	const exists = await deps.variantRepo.existsById(parsed.variantId)
	if (!exists) throw new Error("Variant not found")

	await deps.baseRateRepo.setCanonicalBaseForVariant({
		variantId: parsed.variantId,
		currency: parsed.currency,
		basePrice: parsed.basePrice,
	})

	return { variantId: parsed.variantId }
}
