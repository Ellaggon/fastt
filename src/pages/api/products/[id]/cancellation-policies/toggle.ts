import type { APIRoute } from "astro"
import { togglePolicyAssignmentCapa6UseCase } from "@/container/policies-write.container"

export const POST: APIRoute = async ({ request }) => {
	const { assignmentId, isActive } = await request.json()
	await togglePolicyAssignmentCapa6UseCase({
		assignmentId: String(assignmentId ?? ""),
		isActive: Boolean(isActive),
	})
	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json", "Deprecation": "true" },
	})
}
