import { db, eq, PolicyAssignment } from "astro:db"

export async function toggleCancellationPolicyAssignment(params: {
	assignmentId: string
	isActive: boolean
}): Promise<Response> {
	const { assignmentId, isActive } = params
	await db.update(PolicyAssignment).set({ isActive }).where(eq(PolicyAssignment.id, assignmentId))
	return new Response(JSON.stringify({ success: true }))
}
