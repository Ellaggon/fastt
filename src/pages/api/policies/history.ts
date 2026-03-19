import type { APIRoute } from "astro"
import { listPolicyHistoryUseCase } from "@/container"

export const GET: APIRoute = async ({ url }) => {
	const groupId = url.searchParams.get("groupId")

	if (!groupId) {
		return new Response("Missing groupId", { status: 400 })
	}

	const rows = await listPolicyHistoryUseCase(groupId)

	return new Response(JSON.stringify(rows))
}
