import type { APIRoute } from "astro"
import { db, and, eq, PolicyAssignment } from "astro:db"

export const POST: APIRoute = async ({ request }) => {
	const { groupId, scopeId } = await request.json()

	await db.update(PolicyAssignment).set({ isActive: false })
	and(eq(PolicyAssignment.policyGroupId, groupId), eq(PolicyAssignment.scopeId, scopeId))

	return new Response(JSON.stringify({ success: true }))
}
