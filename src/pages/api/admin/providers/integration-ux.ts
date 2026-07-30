import type { APIRoute } from "astro"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import { summarizeProviderIntegrationUx } from "@/lib/provider-integration-ux"

export const GET: APIRoute = async ({ request }) => {
	try {
		await requireInternalAdmin(request)
		const url = new URL(request.url)
		const summary = await summarizeProviderIntegrationUx({
			providerId: url.searchParams.get("providerId"),
			limit: Number(url.searchParams.get("limit") ?? 5_000),
			maturityMinutes: Number(url.searchParams.get("maturityMinutes") ?? 30),
		})
		return Response.json(
			{ ok: true, summary },
			{ headers: { "Cache-Control": "private, no-store" } }
		)
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json({ error: "INTEGRATION_UX_REPORT_FAILED" }, { status: 500 })
	}
}
