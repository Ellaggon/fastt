import type { APIRoute } from "astro"
import { db, Policy, PolicyGroup, CancellationTier, PolicyAssignment } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	if (!productId) return new Response("Missing productId", { status: 400 })

	const { name, tiers } = await request.json()

	const groupId = randomUUID()
	const policyId = randomUUID()

	/* 1️⃣ Crear grupo */
	await db.insert(PolicyGroup).values({
		id: groupId,
		category: "Cancellation",
	})

	/* 2️⃣ Crear policy version 1 */
	await db.insert(Policy).values({
		id: policyId,
		groupId,
		description: name,
		version: 1,
		status: "active",
	})

	/* 3️⃣ Assignment */
	await db.insert(PolicyAssignment).values({
		id: randomUUID(),
		policyGroupId: groupId,
		scope: "product",
		scopeId: productId,
		isActive: true,
	})

	/* 4️⃣ tiers */
	for (const tier of tiers ?? []) {
		await db.insert(CancellationTier).values({
			id: randomUUID(),
			policyId,
			daysBeforeArrival: Number(tier.daysBeforeArrival),
			penaltyType: tier.penaltyType,
			penaltyAmount: Number(tier.penaltyAmount ?? 0),
		})
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
