import type { APIRoute } from "astro"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { getProvider360 } from "@/modules/casework/public"

export const GET: APIRoute = async ({ request, params }) => {
	try {
		await requireInternalPermission(request, "provider.compliance.read", {
			type: "provider",
			id: String(params.providerId ?? ""),
		})
		const data = await getProvider360(String(params.providerId ?? ""))
		return data
			? Response.json({ ok: true, data })
			: Response.json({ error: "provider_not_found" }, { status: 404 })
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json({ error: "provider_360_failed" }, { status: 500 })
	}
}
