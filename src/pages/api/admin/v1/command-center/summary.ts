import type { APIRoute } from "astro"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { getCommandCenterSummary } from "@/modules/casework/public"

export const GET: APIRoute = async ({ request }) => {
	try {
		await requireInternalPermission(request, "provider.compliance.read")
		return Response.json({ ok: true, data: await getCommandCenterSummary() })
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json({ error: "command_center_summary_failed" }, { status: 500 })
	}
}
