import { getSupabaseConfig, type SupabaseSession, fetchSupabaseUser } from "./supabaseClient"

type MfaError = { ok: false; error: string; status: number }
type MfaFactor = {
	id: string
	type: string
	status: string
	friendly_name?: string | null
}

type MfaResult<T> = { ok: true; value: T } | MfaError

async function authRequest(
	accessToken: string,
	path: string,
	init: RequestInit
): Promise<Response | null> {
	const config = getSupabaseConfig()
	if (!config || !accessToken) return null
	try {
		return await fetch(`${config.url}/auth/v1${path}`, {
			...init,
			headers: {
				"apikey": config.anonKey,
				"Authorization": `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				...init.headers,
			},
		})
	} catch {
		return null
	}
}

async function responseError(response: Response | null): Promise<MfaError> {
	if (!response) return { ok: false, error: "mfa_service_unavailable", status: 503 }
	const text = await response.text().catch(() => "")
	return { ok: false, error: text || "mfa_request_failed", status: response.status }
}

export async function listTotpFactors(accessToken: string): Promise<MfaResult<MfaFactor[]>> {
	const response = await authRequest(accessToken, "/factors", { method: "GET" })
	if (!response?.ok) return responseError(response)
	const body = (await response.json()) as { factors?: unknown }
	const factors = Array.isArray(body.factors) ? body.factors : []
	return {
		ok: true,
		value: factors.flatMap((factor) => {
			if (!factor || typeof factor !== "object") return []
			const value = factor as Record<string, unknown>
			if (typeof value.id !== "string" || typeof value.type !== "string") return []
			return [
				{
					id: value.id,
					type: value.type,
					status: typeof value.status === "string" ? value.status : "unverified",
					friendly_name: typeof value.friendly_name === "string" ? value.friendly_name : null,
				},
			]
		}),
	}
}

export async function enrollTotpFactor(
	accessToken: string
): Promise<MfaResult<{ factorId: string; qrCode: string }>> {
	const response = await authRequest(accessToken, "/factors", {
		method: "POST",
		body: JSON.stringify({ factor_type: "totp", friendly_name: "FASTT Command Center" }),
	})
	if (!response?.ok) return responseError(response)
	const body = (await response.json()) as Record<string, unknown>
	const totp = body.totp as Record<string, unknown> | undefined
	if (typeof body.id !== "string" || typeof totp?.qr_code !== "string") {
		return { ok: false, error: "mfa_invalid_enrollment", status: 502 }
	}
	return { ok: true, value: { factorId: body.id, qrCode: totp.qr_code } }
}

export async function verifyTotpFactor(params: {
	accessToken: string
	factorId: string
	code: string
	expectedUserId: string
}): Promise<MfaResult<SupabaseSession>> {
	const challenge = await authRequest(
		params.accessToken,
		`/factors/${encodeURIComponent(params.factorId)}/challenge`,
		{
			method: "POST",
		}
	)
	if (!challenge?.ok) return responseError(challenge)
	const challengeBody = (await challenge.json()) as { id?: unknown }
	if (typeof challengeBody.id !== "string")
		return { ok: false, error: "mfa_invalid_challenge", status: 502 }

	const verification = await authRequest(
		params.accessToken,
		`/factors/${encodeURIComponent(params.factorId)}/verify`,
		{ method: "POST", body: JSON.stringify({ challenge_id: challengeBody.id, code: params.code }) }
	)
	if (!verification?.ok) return responseError(verification)
	const session = (await verification.json()) as SupabaseSession
	if (!session.access_token || !session.refresh_token || !Number.isFinite(session.expires_in)) {
		return { ok: false, error: "mfa_invalid_session", status: 502 }
	}
	const verifiedUser = await fetchSupabaseUser(session.access_token)
	if (!verifiedUser || verifiedUser.id !== params.expectedUserId) {
		return { ok: false, error: "mfa_session_user_mismatch", status: 403 }
	}
	return { ok: true, value: session }
}
