import type { VariantRepositoryPort } from "../ports/VariantRepositoryPort"

export function createGetVariantByIdQuery(deps: { repo: VariantRepositoryPort }) {
	return async function getVariantById(variantId: string) {
		if (!variantId) return null
		const v = await deps.repo.getById(variantId)
		return v ?? null
	}
}
