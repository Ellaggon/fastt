const REFRESH_SKEW_MS = 2 * 60 * 1000

function decodeBase64Url(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
	const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
	return Buffer.from(normalized + padding, "base64").toString("utf8")
}

export function readAccessTokenExpiryMs(accessToken: string): number | null {
	try {
		const payloadSegment = accessToken.split(".")[1]
		if (!payloadSegment) return null
		const payload = JSON.parse(decodeBase64Url(payloadSegment)) as { exp?: unknown }
		return typeof payload.exp === "number" ? payload.exp * 1000 : null
	} catch {
		return null
	}
}

export function shouldRefreshAccessToken(accessToken: string | null, now = Date.now()): boolean {
	if (!accessToken) return true
	const expiresAt = readAccessTokenExpiryMs(accessToken)
	if (!expiresAt) return true
	return expiresAt <= now + REFRESH_SKEW_MS
}
