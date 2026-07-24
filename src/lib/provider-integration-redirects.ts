function integrationsRedirect(request: Request, params: URLSearchParams) {
	const url = new URL("/provider/settings/integrations", request.url)
	params.forEach((value, key) => url.searchParams.set(key, value))
	return Response.redirect(url, 303)
}

export function resolveIntegrationUiMode(raw: unknown): "simple" | "pro" {
	return String(raw ?? "").trim() === "pro" ? "pro" : "simple"
}

export function redirectIntegrationsSuccess(
	request: Request,
	success: string,
	uiMode: "simple" | "pro" = "simple"
) {
	return integrationsRedirect(request, new URLSearchParams({ success, mode: uiMode }))
}

export function redirectIntegrationsError(
	request: Request,
	error: string,
	uiMode: "simple" | "pro" = "simple"
) {
	return integrationsRedirect(request, new URLSearchParams({ error, mode: uiMode }))
}
