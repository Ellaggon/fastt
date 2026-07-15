import type { VariantManagementRepositoryPort } from "../../ports/VariantManagementRepositoryPort"

export async function deleteVariant(
	deps: { repo: VariantManagementRepositoryPort },
	params: { variantId: string }
): Promise<{ ok: true; variantId: string }> {
	const variantId = String(params.variantId ?? "").trim()
	if (!variantId) throw new Error("variantId_required")

	const variant = await deps.repo.getVariantById(variantId)
	if (!variant) throw new Error("Variant not found")

	await deps.repo.deleteVariantCascade(variantId)

	return { ok: true, variantId }
}
