import type { APIRoute } from "astro"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { loadTerritorialRedesignDrafts } from "@/lib/commercial-policy/territorial-redesign-load"

export const POST: APIRoute = async ({ request }) => {
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return Response.json({ error: "invalid_origin" }, { status: 403 })
	try {
		const principal = await requireInternalPermission(request, "policy.edit")
		await requireRecentInternalAuthentication({ request, user: principal.user })
		const result = await loadTerritorialRedesignDrafts(principal.user.id)
		return Response.json({
			ok: true,
			...result,
			redirectTo:
				"/admin/commercial-policies?view=policies&task=reorganization&result=drafts_prepared",
		})
	} catch (error) {
		if (error instanceof Response) return error
		console.error("commercial_policy.territorial_redesign_failed", error)
		return Response.json(
			{
				error: "redesign_reconciliation_required",
				message:
					"No se preparó el paquete. La configuración cambió o necesita conciliación; no se modificaron políticas vigentes.",
			},
			{ status: 409 }
		)
	}
}
