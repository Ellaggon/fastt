import { db, Policy, CancellationTier, eq, desc } from "astro:db"
import { randomUUID } from "node:crypto"

export async function updateCancellationPolicy(params: {
	groupId: string
	name: unknown
	tiers: unknown
}): Promise<Response> {
	const { groupId, name, tiers } = params

	if (!groupId) return new Response("Missing groupId", { status: 400 })

	const last = await db
		.select()
		.from(Policy)
		.where(eq(Policy.groupId, groupId))
		.orderBy(desc(Policy.version))
		.limit(1)

	if (!last.length) return new Response("Policy not found", { status: 404 })

	const lastPolicy = last[0]

	/* archivar versión anterior */
	await db.update(Policy).set({ status: "archived" }).where(eq(Policy.id, lastPolicy.id))

	/* nueva versión */
	const newPolicyId = randomUUID()

	await db.insert(Policy).values({
		id: newPolicyId,
		groupId,
		description: String(name ?? ""),
		version: (lastPolicy as any).version + 1,
		status: "active",
	})

	for (const tier of (tiers as any) ?? []) {
		await db.insert(CancellationTier).values({
			id: randomUUID(),
			policyId: newPolicyId,
			daysBeforeArrival: (tier as any).daysBeforeArrival,
			penaltyType: (tier as any).penaltyType,
			penaltyAmount: (tier as any).penaltyAmount ?? 0,
		})
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
