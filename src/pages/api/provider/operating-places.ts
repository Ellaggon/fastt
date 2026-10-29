import type { APIRoute } from "astro"
import { searchOperatingPlaces } from "@/lib/tours/operating-geography"

/** Public geography only; catalogue presence never grants commercial admission. */
export const GET: APIRoute = async ({ url }) => {
	const country = url.searchParams.get("country")?.trim().toUpperCase()
	if (country && !/^[A-Z]{2}$/.test(country)) return new Response(null, { status: 400 })
	const offset = Number(url.searchParams.get("offset") ?? 0)
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
		return new Response(null, { status: 400 })
	const rows = await searchOperatingPlaces(
		(url.searchParams.get("q") ?? "").slice(0, 100),
		country,
		offset
	)
	return Response.json(
		{ places: rows.slice(0, 30), hasMore: rows.length > 30 },
		{ headers: { "Cache-Control": "public, max-age=60" } }
	)
}
