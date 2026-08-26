import type { VariantManagementRepositoryPort } from "../../ports/VariantManagementRepositoryPort"
import { setVariantSalesEnabledSchema } from "../../schemas/variant/variantSchemas"

export async function setVariantSalesEnabled(
	deps: { repo: VariantManagementRepositoryPort },
	params: { variantId: string; salesEnabled: boolean }
): Promise<{ variantId: string; salesEnabled: boolean }> {
	const parsed = setVariantSalesEnabledSchema.parse(params)
	const variant = await deps.repo.getVariantById(parsed.variantId)
	if (!variant) throw new Error("Variant not found")
	if (parsed.salesEnabled && variant.lifecycleState !== "ready") {
		throw new Error("VARIANT_NOT_READY_FOR_SALES")
	}
	await deps.repo.setVariantSalesEnabled(parsed)
	return parsed
}
