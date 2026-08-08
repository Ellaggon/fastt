import type { APIRoute } from "astro"
import { z } from "zod"
import { tourTrustRepository } from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { createVerifiedProductReview } from "@/modules/catalog/public"

const schema = z.object({
	bookingId: z.string().trim().min(1),
	rating: z.coerce.number().int().min(1).max(5),
	body: z.string().trim().max(2000).optional().nullable(),
})

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.id) return json({ error: "unauthorized" }, 401)

		const body = await request.json().catch(() => ({}))
		const parsed = schema.parse(body)
		const result = await createVerifiedProductReview(
			{ repo: tourTrustRepository },
			{
				userId: user.id,
				bookingId: parsed.bookingId,
				rating: parsed.rating,
				body: parsed.body ?? null,
			}
		)

		if (!result.ok) {
			const status =
				result.error === "unauthorized"
					? 401
					: result.error === "booking_not_found"
						? 404
						: result.error === "already_reviewed"
							? 409
							: result.error === "validation_error"
								? 400
								: 403
			return json({ error: result.error }, status)
		}

		return json({
			ok: true,
			reviewId: result.reviewId,
			status: result.status,
			idempotent: Boolean(result.idempotent),
			message: result.idempotent
				? "Reseña ya registrada para esta reserva."
				: "Reseña enviada a moderación. Solo reseñas publicadas afectan el rating público.",
		})
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: "validation_error", issues: error.issues }, 400)
		}
		console.error("reviews/create", error)
		return json({ error: "internal_error" }, 500)
	}
}
