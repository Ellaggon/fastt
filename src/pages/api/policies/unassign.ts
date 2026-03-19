import type { APIRoute } from "astro"
import { unassignPolicyGroupUseCase } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const { groupId, scopeId } = await request.json()

	await unassignPolicyGroupUseCase(groupId, scopeId)

	return new Response(JSON.stringify({ success: true }))
}
