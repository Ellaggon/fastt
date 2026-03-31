import type { CancellationPolicyRepositoryPort } from "../ports/CancellationPolicyRepositoryPort"

export async function createCancellationPolicy(params: {
	repo: CancellationPolicyRepositoryPort
	productId: string
	name: unknown
	tiers: unknown
}): Promise<Response> {
	const { repo, productId, name, tiers } = params
	if (!productId) return new Response("Missing productId", { status: 400 })

	await repo.createCancellationPolicy({
		productId,
		name: String(name ?? ""),
		tiers: ((tiers as any) ?? []) as unknown[],
	})

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
