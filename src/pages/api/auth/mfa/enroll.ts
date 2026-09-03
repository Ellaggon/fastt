import type { APIRoute } from "astro"

import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { enrollTotpFactor } from "@/lib/auth/supabaseMfa"

export const POST: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	const accessToken = getAccessTokenFromRequest(request)
	if (!user || !accessToken) return Response.json({ error: "unauthorized" }, { status: 401 })

	const result = await enrollTotpFactor(accessToken)
	if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
	return Response.json(result.value, { headers: { "Cache-Control": "no-store" } })
}
