// src/pages/api/destinations.ts
import type { APIRoute } from "astro"
import { searchDestinations } from "@/modules/catalog/public"

export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url)
		const q = (url.searchParams.get("q") || "").trim()
		const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50)

		const formatted = await searchDestinations({ q, limit })

		return new Response(JSON.stringify(formatted), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err) {
		return new Response(JSON.stringify({ error: "" + err }), { status: 500 })
	}
}
