import type { CancellationPolicyRepositoryPort } from "../ports/CancellationPolicyRepositoryPort"

export async function updateCancellationPolicy(params: {
	repo: CancellationPolicyRepositoryPort
	groupId: string
	name: unknown
	tiers: unknown
}): Promise<Response> {
	const { repo, groupId, name, tiers } = params

	if (!groupId) return new Response("Missing groupId", { status: 400 })

	const ok = await repo.updateCancellationPolicy({
		groupId,
		name: String(name ?? ""),
		tiers: ((tiers as any) ?? []) as unknown[],
	})

	if (!ok) return new Response("Policy not found", { status: 404 })

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
