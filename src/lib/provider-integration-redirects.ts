type IntegrationRedirectOptions = {
	returnTo?: unknown
	params?: Record<string, string | null | undefined>
}

const SENSITIVE_QUERY_KEYS = /^(?:access_?token|refresh_?token|credential|secret|code|state)$/i

export function safeIntegrationReturnTo(request: Request, raw: unknown): URL | null {
	const value = String(raw ?? "").trim()
	if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
		return null
	const url = new URL(value, request.url)
	if (
		url.origin !== new URL(request.url).origin ||
		!url.pathname.startsWith("/provider/settings/integrations")
	) {
		return null
	}
	for (const key of url.searchParams.keys()) {
		if (SENSITIVE_QUERY_KEYS.test(key)) return null
	}
	return url
}

function integrationsRedirect(
	request: Request,
	params: URLSearchParams,
	uiMode: "simple" | "pro",
	options: IntegrationRedirectOptions = {}
) {
	const fallbackPath =
		uiMode === "pro"
			? "/provider/settings/integrations/connections"
			: "/provider/settings/integrations"
	const url =
		safeIntegrationReturnTo(request, options.returnTo) ?? new URL(fallbackPath, request.url)
	params.forEach((value, key) => url.searchParams.set(key, value))
	Object.entries(options.params ?? {}).forEach(([key, value]) => {
		if (value != null && !SENSITIVE_QUERY_KEYS.test(key)) url.searchParams.set(key, value)
	})
	return Response.redirect(url, 303)
}

export function resolveIntegrationUiMode(raw: unknown): "simple" | "pro" {
	return String(raw ?? "").trim() === "pro" ? "pro" : "simple"
}

export function redirectIntegrationsSuccess(
	request: Request,
	success: string,
	uiMode: "simple" | "pro" = "simple",
	options: IntegrationRedirectOptions = {}
) {
	return integrationsRedirect(request, new URLSearchParams({ success }), uiMode, options)
}

export function redirectIntegrationsError(
	request: Request,
	error: string,
	uiMode: "simple" | "pro" = "simple",
	options: IntegrationRedirectOptions = {}
) {
	return integrationsRedirect(request, new URLSearchParams({ error }), uiMode, options)
}
