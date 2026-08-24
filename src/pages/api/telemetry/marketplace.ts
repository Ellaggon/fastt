import type { APIRoute } from "astro"
import { z } from "zod"
import { tourTrustRepository } from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { recordMarketplaceEvent } from "@/modules/catalog/public"

const schema = z.object({
	eventType: z.enum(["impression", "click", "booking_attributed"]),
	surface: z.string().trim().min(1).max(80),
	sourceProductId: z.string().trim().min(1).optional().nullable(),
	targetProductId: z.string().trim().min(1).optional().nullable(),
	geoPlaceId: z.string().trim().min(1).optional().nullable(),
	bookingId: z.string().trim().min(1).optional().nullable(),
	sessionId: z.string().trim().min(1).max(120).optional().nullable(),
	meta: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const POST: APIRoute = async ({ request }) => {
	try {
		const parsed = schema.parse(await request.json().catch(() => ({})))
		const user =
			parsed.eventType === "booking_attributed" ? await getUserFromRequest(request) : null
		const result = await recordMarketplaceEvent(
			{ repo: tourTrustRepository },
			{
				eventType: parsed.eventType,
				surface: parsed.surface,
				sourceProductId: parsed.sourceProductId ?? null,
				targetProductId: parsed.targetProductId ?? null,
				geoPlaceId: parsed.geoPlaceId ?? null,
				bookingId: parsed.bookingId ?? null,
				sessionId: parsed.sessionId ?? null,
				meta: parsed.meta ?? null,
				userId: user?.id ?? null,
			}
		)
		if (!result.ok) {
			const status =
				result.error === "unauthorized"
					? 401
					: result.error === "booking_not_found"
						? 404
						: result.error === "not_eligible"
							? 403
							: 400
			return new Response(JSON.stringify({ error: result.error }), {
				status,
				headers: { "Content-Type": "application/json" },
			})
		}
		return new Response(
			JSON.stringify({
				ok: true,
				eventId: result.eventId,
				idempotent: result.idempotent,
			}),
			{
				status: result.idempotent ? 200 : 202,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return new Response(JSON.stringify({ error: "validation_error" }), { status: 400 })
		}
		console.error("telemetry/marketplace", error)
		return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 })
	}
}
