import { db, Policy, PolicyGroup, CancellationTier, PolicyAssignment } from "astro:db"
import { randomUUID } from "node:crypto"

export async function createCancellationPolicy(params: {
	productId: string
	name: unknown
	tiers: unknown
}): Promise<Response> {
	const { productId, name, tiers } = params
	if (!productId) return new Response("Missing productId", { status: 400 })

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
		description: String(name ?? ""),
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
	for (const tier of (tiers as any) ?? []) {
		await db.insert(CancellationTier).values({
			id: randomUUID(),
			policyId,
			daysBeforeArrival: Number((tier as any).daysBeforeArrival),
			penaltyType: (tier as any).penaltyType,
			penaltyAmount: Number((tier as any).penaltyAmount ?? 0),
		})
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
