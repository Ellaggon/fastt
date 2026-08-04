const RESET_PASSWORD_PATH = "/auth/reset-password"

function asHttpUrl(value: string): URL | null {
	try {
		const url = new URL(value)
		return url.protocol === "http:" || url.protocol === "https:" ? url : null
	} catch {
		return null
	}
}

export function getPasswordResetRedirectTo(requestUrl: string, explicitUrl?: string): string {
	const configured = String(explicitUrl ?? "").trim()
	if (configured) {
		const explicit = asHttpUrl(configured)
		if (!explicit) throw new Error("AUTH_PASSWORD_RESET_REDIRECT_URL must be an HTTP(S) URL")
		return explicit.toString()
	}

	const request = asHttpUrl(requestUrl)
	if (!request) throw new Error("Password recovery request URL must be an HTTP(S) URL")
	return new URL(RESET_PASSWORD_PATH, request.origin).toString()
}
