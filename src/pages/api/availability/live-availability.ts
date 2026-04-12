// @deprecated — Use /api/products/[productId]/offers instead
import type { APIRoute } from "astro"

export const POST: APIRoute = async ({ request }) => {
	console.warn("DEPRECATED: live-availability endpoint called", {
		path: request.url,
	})

	const body = await request.json().catch(() => ({}))
	const productId = String(body?.productId ?? "").trim()
	if (!productId) {
		return new Response(
			JSON.stringify({ error: "validation_error", details: "productId is required" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}

	const proxyUrl = new URL(`/api/products/${encodeURIComponent(productId)}/offers`, request.url)
	const proxyResponse = await fetch(proxyUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})

	return new Response(proxyResponse.body, {
		status: proxyResponse.status,
		headers: { "Content-Type": "application/json" },
	})
}
