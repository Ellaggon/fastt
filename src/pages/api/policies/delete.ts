import type { APIRoute } from "astro"
import {
	db,
	eq,
	and,
	Policy,
	PolicyRule,
	CancellationTier,
	PolicyGroup,
	PolicyAssignment,
} from "astro:db"

export const POST: APIRoute = async ({ request }) => {
	const { policyId } = await request.json()

	if (!policyId) {
		return new Response("Missing policyId", { status: 400 })
	}

	const existing = await db
		.select()
		.from(Policy)
		.where(eq(Policy.id, policyId))
		.get()

	if (!existing) {
		return new Response("Policy not found", { status: 404 })
	}

	if (existing.status !== "draft") {
		return new Response("Only draft policies can be deleted", { status: 400 })
	}

	const groupId = existing.groupId

	await db.transaction(async (tx) => {
		// 1️⃣ eliminar dependencias
		await tx.delete(PolicyRule).where(eq(PolicyRule.policyId, policyId))
		await tx.delete(CancellationTier).where(eq(CancellationTier.policyId, policyId))
		await tx.delete(Policy).where(eq(Policy.id, policyId))

		// 2️⃣ verificar si quedan más versiones en el grupo
		const remaining = await tx
			.select()
			.from(Policy)
			.where(eq(Policy.groupId, groupId))

		// 3️⃣ si no quedan políticas → eliminar grupo y assignments
		if (remaining.length === 0) {
			await tx.delete(PolicyAssignment).where(eq(PolicyAssignment.policyGroupId, groupId))
			await tx.delete(PolicyGroup).where(eq(PolicyGroup.id, groupId))
		}
	})

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}