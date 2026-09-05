import type { APIRoute } from "astro"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { getCaseEvidence, getCaseWorkspace } from "@/modules/casework/public"

export const GET: APIRoute = async ({ request, params }) => {
	try {
		await requireInternalPermission(request, "provider.compliance.read")
		const data = await getCaseWorkspace(String(params.caseId ?? ""))
		return data
			? Response.json({ ok: true, data: { ...data, evidence: await getCaseEvidence(data) } })
			: Response.json({ error: "case_not_found" }, { status: 404 })
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json({ error: "case_workspace_failed" }, { status: 500 })
	}
}
