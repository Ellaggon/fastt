import type { APIRoute } from "astro"

import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { listTotpFactors } from "@/lib/auth/supabaseMfa"

export const GET: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	const accessToken = getAccessTokenFromRequest(request)
	if (!user || !accessToken) return Response.json({ error: "unauthorized" }, { status: 401 })

	const result = await listTotpFactors(accessToken)
	if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
	return Response.json({ factors: result.value.filter((factor) => factor.type === "totp") })
}
