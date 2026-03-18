import type { APIRoute } from "astro"
import { db, Policy, PolicyGroup, PolicyAssignment, CancellationTier, eq } from "astro:db"
import { randomUUID } from "crypto"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const { previousPolicyId, description, scope, scopeId, category, cancellationTiers } = body

	if (!scope || !scopeId || !category) {
		return new Response("Missing fields", { status: 400 })
	}

	let groupId: string
	let version = 1

	/* ================= VERSIONING ================= */

	if (previousPolicyId) {
		const existing = await db.select().from(Policy).where(eq(Policy.id, previousPolicyId)).get()

		if (!existing) {
			return new Response("Policy not found", { status: 404 })
		}

		groupId = existing.groupId
		version = existing.version + 1
	} else {
		groupId = randomUUID()

		await db.insert(PolicyGroup).values({
			id: groupId,
			category,
		})
	}

	const newPolicyId = randomUUID()

	/* ================= CREATE POLICY ================= */

	await db.insert(Policy).values({
		id: newPolicyId,
		groupId,
		description: description ?? "",
		version,
		status: "draft",
		effectiveFrom: null,
	})

	/* ================= CANCELLATION STRUCTURE ================= */

	if (category === "Cancellation") {
		if (!Array.isArray(cancellationTiers) || cancellationTiers.length === 0) {
			return new Response("Cancellation tiers required", { status: 400 })
		}

		for (const tier of cancellationTiers) {
			await db.insert(CancellationTier).values({
				id: randomUUID(),
				policyId: newPolicyId,
				daysBeforeArrival: Number(tier.daysBeforeArrival) || 0,
				penaltyType: tier.penaltyType ?? "percentage",
				penaltyAmount: Number(tier.penaltyAmount) || 0,
			})
		}
	}

	/* ================= ASSIGNMENT ================= */

	const existingAssignment = await db
		.select()
		.from(PolicyAssignment)
		.where(eq(PolicyAssignment.policyGroupId, groupId))
		.get()

	if (!existingAssignment) {
		await db.insert(PolicyAssignment).values({
			id: randomUUID(),
			policyGroupId: groupId,
			scope,
			scopeId,
			isActive: true,
		})
	}

	return Response.json({ id: newPolicyId, groupId })
}
