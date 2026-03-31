import type { CatalogRestrictionRepositoryPort } from "../ports/CatalogRestrictionRepositoryPort"

export async function deleteRestriction(
	deps: { repo: CatalogRestrictionRepositoryPort },
	ruleId: string
): Promise<Response> {
	if (!ruleId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	await deps.repo.deleteRestriction(ruleId)

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
