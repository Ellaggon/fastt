import type { APIRoute } from "astro"

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url)
	const q = url.searchParams.get("q")

	if (!q) {
		return new Response(JSON.stringify({ error: "Missing query" }), {
			status: 400,
		})
	}

	try {
		const response = await fetch(
			`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
			{
				headers: {
					"User-Agent": "FasttTravel/1.0 (contact@fastt.com)", // requerido por Nominatim
					"Accept-Language": "es",
				},
			}
		)

		const data = await response.json()
		return new Response(JSON.stringify(data), {
			headers: { "Content-Type": "application/json" },
		})
	} catch (err) {
		return new Response(JSON.stringify({ error: "Failed to fetch data" }), {
			status: 500,
		})
	}
}
