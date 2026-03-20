import type { CancellationPolicyRepositoryPort } from "../ports/CancellationPolicyRepositoryPort"

export async function getCancellationPolicies(
	deps: { repo: CancellationPolicyRepositoryPort },
	productId: string
): Promise<Response> {
	if (!productId) return new Response("Missing id", { status: 400 })

	const policies = await deps.repo.getCancellationPolicies(productId)

	return new Response(JSON.stringify({ policies }), { status: 200 })
}
