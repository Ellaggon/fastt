import type { APIRoute } from "astro"
import { db, Policy, CancellationTier, eq, desc } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ request }) => {
	const { groupId, name, tiers } = await request.json()

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
		description: name,
		version: lastPolicy.version + 1,
		status: "active",
	})

	for (const tier of tiers ?? []) {
		await db.insert(CancellationTier).values({
			id: randomUUID(),
			policyId: newPolicyId,
			daysBeforeArrival: tier.daysBeforeArrival,
			penaltyType: tier.penaltyType,
			penaltyAmount: tier.penaltyAmount ?? 0,
		})
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
