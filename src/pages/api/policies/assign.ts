import type { APIRoute } from "astro"
import { assignPolicyGroupUseCase } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const { groupId, scopeId } = await request.json()

	await assignPolicyGroupUseCase(groupId, scopeId)

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
