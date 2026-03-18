import { runPolicyCompiler } from "@/core/policy/compiler/policy.compiler"
import type { APIRoute } from "astro"
import { db, eq, and, Policy, PolicyAssignment } from "astro:db"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()
	const { policyId, effectiveFrom } = body

	if (!policyId) return new Response("Missing policyId", { status: 400 })

	const policy = await db.select().from(Policy).where(eq(Policy.id, policyId)).get()
	if (!policy) return new Response("Policy not found", { status: 404 })

	const groupId = policy.groupId

	const effectiveDateIso = effectiveFrom
		? new Date(effectiveFrom).toISOString()
		: new Date().toISOString()

	await db.transaction(async (tx) => {
		await tx
			.update(Policy)
			.set({ status: "archived", effectiveTo: effectiveDateIso })
			.where(and(eq(Policy.groupId, groupId), eq(Policy.status, "active")))

		await tx
			.update(Policy)
			.set({
				status: "active",
				effectiveFrom: effectiveDateIso,
				effectiveTo: null,
			})
			.where(eq(Policy.id, policyId))
	})

	const assignments = await db
		.select()
		.from(PolicyAssignment)
		.where(eq(PolicyAssignment.policyGroupId, groupId))

	Promise.all(assignments.map((a) => runPolicyCompiler(a.scope, a.scopeId))).catch(console.error)

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
