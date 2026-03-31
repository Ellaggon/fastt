import type { CatalogRestrictionRepositoryPort } from "../ports/CatalogRestrictionRepositoryPort"

export async function getRestrictionRatePlans(
	deps: { repo: CatalogRestrictionRepositoryPort },
	productId: string
): Promise<Response> {
	const pid = String(productId || "")

	if (!pid) {
		return new Response(JSON.stringify({ ratePlans: [] }), { status: 400 })
	}

	const ratePlans = await deps.repo.listRestrictionRatePlans(pid)

	return new Response(JSON.stringify({ ratePlans }), { status: 200 })
}
