import type { CatalogRestrictionRepositoryPort } from "../ports/CatalogRestrictionRepositoryPort"

export async function getRestrictionRooms(
	deps: { repo: CatalogRestrictionRepositoryPort },
	productId: string
): Promise<Response> {
	const pid = String(productId || "")

	if (!pid) {
		return new Response(JSON.stringify({ variants: [] }), { status: 400 })
	}

	const variants = await deps.repo.listRestrictionRooms(pid)

	return new Response(JSON.stringify({ variants }), { status: 200 })
}
