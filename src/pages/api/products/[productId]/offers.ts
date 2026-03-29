import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { searchOffers } from "@/container"

const schema = z.object({
	productId: z.string().min(1),
	checkIn: z.string().min(1),
	checkOut: z.string().min(1),
	adults: z.coerce.number().int().min(0).optional(),
	children: z.coerce.number().int().min(0).optional(),
	rooms: z.coerce.number().int().min(1).optional(),
})

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const body = await request.json().catch(() => ({}))
		const parsed = schema.parse({
			...body,
			productId: String(params.productId ?? body.productId ?? "").trim(),
		})

		const offers = await searchOffers({
			productId: parsed.productId,
			checkIn: new Date(parsed.checkIn),
			checkOut: new Date(parsed.checkOut),
			adults: parsed.adults ?? 2,
			children: parsed.children ?? 0,
			rooms: parsed.rooms ?? 1,
		})

		return new Response(JSON.stringify({ offers }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e: any) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		return new Response(JSON.stringify({ error: "internal_error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
