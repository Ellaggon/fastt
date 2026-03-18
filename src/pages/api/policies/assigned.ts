import type { APIRoute } from "astro"
import { db, eq, inArray, and, PolicyAssignment, Policy, PolicyGroup } from "astro:db"

export const GET: APIRoute = async ({ url }) => {
	const scopeId = url.searchParams.get("scopeId")
	const category = url.searchParams.get("category")

	if (!scopeId) {
		return new Response("Missing scopeId", { status: 400 })
	}

	const assignments = await db
		.select({
			groupId: PolicyAssignment.policyGroupId,
		})
		.from(PolicyAssignment)
		.where(eq(PolicyAssignment.scopeId, scopeId))

	if (!assignments.length) {
		return new Response(JSON.stringify([]), {
			headers: { "Content-Type": "application/json" },
		})
	}

	const groupIds = assignments.map((a) => a.groupId)

	const baseCondition = inArray(Policy.groupId, groupIds)

	const finalCondition = category
		? and(baseCondition, eq(PolicyGroup.category, category))
		: baseCondition

	const policies = await db
		.select({
			id: Policy.id,
			groupId: Policy.groupId,
			version: Policy.version,
			status: Policy.status,
			description: Policy.description,
			category: PolicyGroup.category,
		})
		.from(Policy)
		.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
		.where(finalCondition)

	return new Response(JSON.stringify(policies), {
		headers: { "Content-Type": "application/json" },
	})
}
