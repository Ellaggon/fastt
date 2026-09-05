import type { APIRoute } from "astro"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { listCommandCenterCases } from "@/modules/casework/public"

export const GET: APIRoute = async ({ request, params }) => {
	try {
		await requireInternalPermission(request, "provider.compliance.read")
		const url = new URL(request.url)
		const queueId = String(params.queueId ?? "all")
		const data = await listCommandCenterCases({
			domain: ["verification", "fiscal", "documents", "payments"].includes(queueId)
				? queueId
				: url.searchParams.get("domain"),
			sla: queueId === "overdue" ? "overdue" : queueId === "due-soon" ? "due_soon" : null,
			riskTier: queueId === "high-risk" ? "high" : url.searchParams.get("riskTier"),
			unassigned: queueId === "unassigned",
			priority: url.searchParams.get("priority"),
			status: url.searchParams.get("status"),
			cursor: url.searchParams.get("cursor"),
			limit: Number(url.searchParams.get("limit") ?? 50),
		})
		return Response.json({ ok: true, data })
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json({ error: "command_center_queue_failed" }, { status: 500 })
	}
}
