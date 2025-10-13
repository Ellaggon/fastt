// src/pages/api/destinations.ts
import type { APIRoute } from "astro"
import { db, Destination, sql } from "astro:db"

// helper: capitaliza la primera letra de cada palabra
function capitalizeWords(text: string | null | undefined): string {
	if (!text) return ""
	return text
		.toLowerCase()
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ")
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url)
		const q = (url.searchParams.get("q") || "").trim()
		const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50)

		let results
		if (!q) {
			results = await db.select().from(Destination).limit(limit).all()
		} else {
			// busqueda case-insensitive por name o slug
			const pattern = `%${q.toLowerCase()}%`
			results = await db
				.select()
				.from(Destination)
				.where(
					sql`(lower(${Destination.name}) LIKE ${pattern} OR lower(${Destination.slug}) LIKE ${pattern} OR lower(${Destination.department}) LIKE ${pattern})`
				)
				.limit(limit)
				.all()
		}

		// Formatear cada resultado antes de devolverlo
		const formatted = results.map((r) => ({
			...r,
			department: capitalizeWords(r.department),
			country: capitalizeWords(r.country),
			name: capitalizeWords(r.name),
		}))

		return new Response(JSON.stringify(formatted), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err) {
		return new Response(JSON.stringify({ error: "" + err }), { status: 500 })
	}
}
