import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { getPublicSearchSurface, type PublicSearchResult } from "@/lib/search/publicSearchSurface"

const schema = z.object({
	destinationId: z.string().trim().min(1),
	checkIn: z.string().trim().min(1),
	checkOut: z.string().trim().min(1),
	currency: z.string().trim().length(3).optional(),
	rooms: z.coerce.number().int().min(1).default(1),
	adults: z.coerce.number().int().min(0).default(2),
	children: z.coerce.number().int().min(0).default(0),
})

function parseISODate(s: string): Date | null {
	const d = new Date(`${s}T00:00:00.000Z`)
	return Number.isNaN(d.getTime()) ? null : d
}

export type SearchV2Result = PublicSearchResult

export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url)
		const parsed = schema.parse({
			destinationId: url.searchParams.get("destinationId") ?? "",
			checkIn: url.searchParams.get("checkIn") ?? url.searchParams.get("checkin") ?? "",
			checkOut: url.searchParams.get("checkOut") ?? url.searchParams.get("checkout") ?? "",
			currency: url.searchParams.get("currency") ?? undefined,
			rooms: url.searchParams.get("rooms") ?? undefined,
			adults: url.searchParams.get("adults") ?? undefined,
			children: url.searchParams.get("children") ?? undefined,
		})

		const checkIn = parseISODate(parsed.checkIn)
		const checkOut = parseISODate(parsed.checkOut)
		if (!checkIn || !checkOut || checkOut <= checkIn) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["dates"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const surface = await getPublicSearchSurface({
			destinationId: parsed.destinationId,
			checkIn: parsed.checkIn,
			checkOut: parsed.checkOut,
			rooms: parsed.rooms,
			adults: parsed.adults,
			children: parsed.children,
			currency: parsed.currency,
		})

		return new Response(JSON.stringify({ results: surface.results, meta: surface.meta }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
				"X-Fastt-Cache": surface.meta.cacheState,
			},
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
