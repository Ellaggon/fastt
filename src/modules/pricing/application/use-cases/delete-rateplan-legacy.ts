import type { RatePlanCommandRepositoryPort } from "../ports/RatePlanCommandRepositoryPort"

export async function deleteRatePlanLegacy(
	deps: { repo: RatePlanCommandRepositoryPort },
	params: { id: string }
): Promise<Response> {
	if (!params?.id) {
		return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })
	}

	const result = await deps.repo.deleteRatePlan(params.id)
	if (result === "not_found") {
		return new Response(JSON.stringify({ error: "RatePlan not found" }), { status: 404 })
	}

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
