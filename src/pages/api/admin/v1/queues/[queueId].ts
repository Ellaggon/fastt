import type { APIRoute } from "astro"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { listCommandCenterCases, parseCommandCenterQueueFilters } from "@/modules/casework/public"

export const GET: APIRoute = async ({ request, params }) => {
	try {
		await requireInternalPermission(request, "provider.compliance.read")
		const url = new URL(request.url)
		const queue = parseCommandCenterQueueFilters(String(params.queueId ?? "all"), url.searchParams)
		const data = await listCommandCenterCases({
			...queue.filters,
			limit: Number(url.searchParams.get("limit") ?? 50),
		})
		return Response.json({ ok: true, data })
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json({ error: "command_center_queue_failed" }, { status: 500 })
	}
}
