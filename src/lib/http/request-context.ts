const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/

export function requestIdFromRequest(request: Request): string {
	const candidate = String(request.headers.get("x-request-id") ?? "").trim()
	return REQUEST_ID_PATTERN.test(candidate) ? candidate : crypto.randomUUID()
}

export function withRequestId(response: Response, requestId: string): Response {
	const headers = new Headers(response.headers)
	headers.set("x-request-id", requestId)
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	})
}
