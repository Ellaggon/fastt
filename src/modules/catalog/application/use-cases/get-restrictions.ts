import type { CatalogRestrictionRepositoryPort } from "../ports/CatalogRestrictionRepositoryPort"

export async function getRestrictions(
	deps: { repo: CatalogRestrictionRepositoryPort },
	productId: string
): Promise<Response> {
	if (!productId) {
		return new Response(JSON.stringify({ error: "Mising productId" }), { status: 400 })
	}

	const restrictions = await deps.repo.listRestrictionsByProduct(productId)

	return new Response(JSON.stringify({ restrictions }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
