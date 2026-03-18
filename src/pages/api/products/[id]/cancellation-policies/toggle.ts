import type { APIRoute } from "astro"
import { db, eq, PolicyAssignment } from "astro:db"

export const POST: APIRoute = async ({ request }) => {
	const { assignmentId, isActive } = await request.json()

	await db
		.update(PolicyAssignment)
		.set({ isActive })
		.where(eq(PolicyAssignment.id, assignmentId))

	return new Response(JSON.stringify({ success: true }))
}