import {
	db,
	eq,
	and,
	desc,
	Policy,
	CancellationTier,
	PolicyAssignment,
	PolicyGroup,
} from "astro:db"

export async function getCancellationPolicies(productId: string): Promise<Response> {
	if (!productId) return new Response("Missing id", { status: 400 })

	const assignments = await db
		.select()
		.from(PolicyAssignment)
		.where(and(eq(PolicyAssignment.scope, "product"), eq(PolicyAssignment.scopeId, productId)))

	if (!assignments.length) return new Response(JSON.stringify({ policies: [] }), { status: 200 })

	const policies: any[] = []

	for (const a of assignments) {
		const policy = await db
			.select()
			.from(Policy)
			.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
			.where(and(eq(Policy.groupId, a.policyGroupId), eq(PolicyGroup.category, "Cancellation")))
			.orderBy(desc(Policy.version))
			.limit(1)

		if (!policy.length) continue

		const tiers = await db
			.select()
			.from(CancellationTier)
			.where(eq(CancellationTier.policyId, policy[0].Policy.id))

		policies.push({
			...policy[0].Policy,
			name: policy[0].Policy.description,
			tiers,
			assignmentId: a.id,
			isActive: a.isActive,
		})
	}

	return new Response(JSON.stringify({ policies }), { status: 200 })
}
