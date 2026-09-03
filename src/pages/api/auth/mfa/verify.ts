import type { APIRoute } from "astro"

import { buildAuthCookieHeaders } from "@/lib/auth/authCookies"
import {
	getAccessTokenFromRequest,
	getSessionIdFromRequest,
	getUserFromRequest,
} from "@/lib/auth/getUserFromRequest"
import { recordElevatedInternalSession } from "@/lib/auth/internalMfaSession"
import { fetchSupabaseUser } from "@/lib/auth/supabaseClient"
import { verifyTotpFactor } from "@/lib/auth/supabaseMfa"

export const POST: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	const accessToken = getAccessTokenFromRequest(request)
	if (!user || !accessToken) return Response.json({ error: "unauthorized" }, { status: 401 })

	const body = (await request.json().catch(() => null)) as {
		factorId?: unknown
		code?: unknown
	} | null
	const factorId = typeof body?.factorId === "string" ? body.factorId.trim() : ""
	const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : ""
	if (!factorId || !/^\d{6,8}$/.test(code)) {
		return Response.json({ error: "invalid_mfa_code" }, { status: 400 })
	}

	const authUser = await fetchSupabaseUser(accessToken)
	if (!authUser) return Response.json({ error: "unauthorized" }, { status: 401 })
	const verified = await verifyTotpFactor({
		accessToken,
		factorId,
		code,
		expectedUserId: authUser.id,
	})
	if (!verified.ok) return Response.json({ error: verified.error }, { status: verified.status })

	const elevatedRequest = new Request(request.url, {
		headers: { Authorization: `Bearer ${verified.value.access_token}` },
	})
	const sessionFingerprint = getSessionIdFromRequest(elevatedRequest)
	if (!sessionFingerprint)
		return Response.json({ error: "mfa_session_fingerprint_failed" }, { status: 502 })
	await recordElevatedInternalSession({
		userId: user.id,
		sessionFingerprint,
		expiresInSeconds: verified.value.expires_in,
	})

	const headers = new Headers({ "Cache-Control": "no-store" })
	for (const cookie of buildAuthCookieHeaders(verified.value)) headers.append("Set-Cookie", cookie)
	return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
