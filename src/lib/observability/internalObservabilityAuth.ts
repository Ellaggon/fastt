/**
 * Shared bearer auth for internal observability endpoints.
 * When FASTT_INFRA_HEALTH_TOKEN is unset, allow only outside production.
 */
export function isInternalObservabilityAuthorized(request: Request): boolean {
	const token = process.env.FASTT_INFRA_HEALTH_TOKEN?.trim()
	if (!token) return process.env.NODE_ENV !== "production"
	const header = request.headers.get("authorization") ?? ""
	const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
	return bearer === token
}

export function unauthorizedObservabilityResponse(): Response {
	return new Response(JSON.stringify({ error: "unauthorized" }), {
		status: 401,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	})
}
