import type { APIRoute } from "astro"
import {
	CancellationTier,
	Policy,
	PolicyAssignment,
	PolicyGroup,
	and,
	db,
	desc,
	eq,
} from "astro:db"

export const GET: APIRoute = async ({ params }) => {
	const productId = params.id
	if (!productId) return new Response("Missing id", { status: 400 })

	const assignments = await db
		.select()
		.from(PolicyAssignment)
		.where(and(eq(PolicyAssignment.scope, "product"), eq(PolicyAssignment.scopeId, productId)))
		.all()

	if (!assignments.length) {
		return new Response(JSON.stringify({ policies: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json", "Deprecation": "true" },
		})
	}

	const policies: any[] = []
	for (const assignment of assignments) {
		const latest = await db
			.select({
				id: Policy.id,
				groupId: Policy.groupId,
				version: Policy.version,
				status: Policy.status,
				description: Policy.description,
			})
			.from(Policy)
			.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
			.where(
				and(
					eq(Policy.groupId, assignment.policyGroupId as any),
					eq(PolicyGroup.category, "Cancellation")
				)
			)
			.orderBy(desc(Policy.version))
			.get()

		if (!latest?.id) continue

		const tiers = await db
			.select()
			.from(CancellationTier)
			.where(eq(CancellationTier.policyId, latest.id))
			.all()

		policies.push({
			...latest,
			name: latest.description,
			tiers,
			assignmentId: assignment.id,
			isActive: assignment.isActive,
		})
	}

	return new Response(JSON.stringify({ policies }), {
		status: 200,
		headers: { "Content-Type": "application/json", "Deprecation": "true" },
	})
}
