import type { APIRoute } from "astro"
import { Policy, db, desc, eq } from "astro:db"
import { createPolicyVersionCapa6UseCase } from "@/container/policies-write.container"

export const POST: APIRoute = async ({ request }) => {
	const { groupId, name, tiers } = await request.json()
	const normalizedGroupId = String(groupId ?? "").trim()
	if (!normalizedGroupId) return new Response("Missing groupId", { status: 400 })

	const latest = await db
		.select({ id: Policy.id })
		.from(Policy)
		.where(eq(Policy.groupId, normalizedGroupId))
		.orderBy(desc(Policy.version))
		.get()
	if (!latest?.id) return new Response("Policy not found", { status: 404 })

	const created = await createPolicyVersionCapa6UseCase({
		previousPolicyId: String(latest.id),
		description: String(name ?? ""),
		cancellationTiers: Array.isArray(tiers) ? tiers : [],
	})

	return new Response(
		JSON.stringify({
			success: true,
			id: created.policyId,
			groupId: created.groupId,
			version: created.version,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json", "Deprecation": "true" },
		}
	)
}
