import { db, eq, and, PolicyAssignment, PolicyGroup } from "astro:db"

export async function findAssignment(scope: string, scopeId: string, category: string) {
	const rows = await db
		.select()
		.from(PolicyAssignment)
		.innerJoin(PolicyGroup, eq(PolicyAssignment.policyGroupId, PolicyGroup.id))
		.where(
			and(
				eq(PolicyAssignment.scope, scope),
				eq(PolicyAssignment.scopeId, scopeId),
				eq(PolicyGroup.category, category)
			)
		)

	return rows[0]
}
