import { getSupabaseConfig, type SupabaseSession, fetchSupabaseUser } from "./supabaseClient"

type MfaError = { ok: false; error: string; status: number }
type MfaFactor = {
	id: string
	type: string
	status: string
	friendly_name?: string | null
}

type MfaResult<T> = { ok: true; value: T } | MfaError

/**
 * GoTrue normally returns an SVG data URI. Re-encode it as base64 so special
 * characters in the SVG cannot be misread by the browser or a proxy.
 */
function normalizeQrCode(value: string): string {
	if (value.startsWith("data:image/svg+xml;base64,")) return value

	const comma = value.indexOf(",")
	const isSvgDataUri = value.startsWith("data:image/svg+xml") && comma >= 0
	const metadata = isSvgDataUri ? value.slice(0, comma).toLowerCase() : ""
	const payload = isSvgDataUri ? value.slice(comma + 1) : value.trim()
	const svg = metadata.endsWith(";base64")
		? Buffer.from(payload, "base64").toString("utf8")
		: isSvgDataUri
			? decodeURIComponent(payload)
			: payload
	// Supabase may prepend an XML declaration before the <svg> element.
	if (svg.includes("<svg")) {
		return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
	}
	return value
}

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

async function responseError(
	response: Response | null,
	operation: "list" | "enroll" | "challenge" | "verify"
): Promise<MfaError> {
	if (!response) return { ok: false, error: `mfa_${operation}_unavailable`, status: 503 }
	const text = await response.text().catch(() => "")
	let providerCode: string | null = null
	try {
		const parsed = JSON.parse(text) as {
			error_code?: unknown
			msg?: unknown
			message?: unknown
			code?: unknown
		}
		if (typeof parsed.error_code === "string") {
			providerCode = parsed.error_code
		} else if (typeof parsed.code === "string") {
			providerCode = parsed.code
		}
		console.warn("auth.mfa.provider_error", {
			operation,
			status: response.status,
			providerCode,
			contentType: response.headers.get("content-type"),
		})
		if (providerCode) return { ok: false, error: providerCode, status: response.status }
	} catch {
		// Supabase can return a non-JSON proxy response. Keep the public error generic.
	}
	console.warn("auth.mfa.provider_error", {
		operation,
		status: response.status,
		providerCode,
		contentType: response.headers.get("content-type"),
	})
	return { ok: false, error: `mfa_${operation}_failed_${response.status}`, status: response.status }
}

export async function listTotpFactors(accessToken: string): Promise<MfaResult<MfaFactor[]>> {
	// Supabase's client implementation derives a user's factors from /user.
	// `/factors` only accepts POST (enroll), hence GET there returns 405.
	const response = await authRequest(accessToken, "/user", { method: "GET" })
	if (!response?.ok) return responseError(response, "list")
	const body = (await response.json()) as { factors?: unknown }
	const factors = Array.isArray(body.factors) ? body.factors : []
	return {
		ok: true,
		value: factors.flatMap((factor) => {
			if (!factor || typeof factor !== "object") return []
			const value = factor as Record<string, unknown>
			const factorType =
				typeof value.factor_type === "string"
					? value.factor_type
					: typeof value.type === "string"
						? value.type
						: null
			if (typeof value.id !== "string" || !factorType) return []
			return [
				{
					id: value.id,
					type: factorType,
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
		// Supabase enforces friendly-name uniqueness per user. A completed enrollment
		// never needs this name again, and an abandoned enrollment must not block recovery.
		body: JSON.stringify({
			factor_type: "totp",
			friendly_name: `FASTT Command Center ${crypto.randomUUID().slice(0, 8)}`,
		}),
	})
	if (!response?.ok) return responseError(response, "enroll")
	const body = (await response.json()) as Record<string, unknown>
	const totp = body.totp as Record<string, unknown> | undefined
	if (typeof body.id !== "string" || typeof totp?.qr_code !== "string") {
		return { ok: false, error: "mfa_invalid_enrollment", status: 502 }
	}
	return { ok: true, value: { factorId: body.id, qrCode: normalizeQrCode(totp.qr_code) } }
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
	if (!challenge?.ok) return responseError(challenge, "challenge")
	const challengeBody = (await challenge.json()) as { id?: unknown }
	if (typeof challengeBody.id !== "string")
		return { ok: false, error: "mfa_invalid_challenge", status: 502 }

	const verification = await authRequest(
		params.accessToken,
		`/factors/${encodeURIComponent(params.factorId)}/verify`,
		{ method: "POST", body: JSON.stringify({ challenge_id: challengeBody.id, code: params.code }) }
	)
	if (!verification?.ok) return responseError(verification, "verify")
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
