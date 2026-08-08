import type { APIRoute } from "astro"
import { z } from "zod"
import { tourTrustRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { transitionTourPrivateRequest } from "@/modules/catalog/public"

const schema = z.object({
	requestId: z.string().trim().min(1),
	status: z.enum(["accepted", "declined"]),
	providerNote: z.string().trim().max(2000).optional().nullable(),
})

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/** Provider accept/decline for private salida quote requests. */
export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.id) return json({ error: "unauthorized" }, 401)
		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) return json({ error: "unauthorized" }, 401)

		const parsed = schema.parse(await request.json().catch(() => ({})))
		const result = await transitionTourPrivateRequest(
			{ repo: tourTrustRepository },
			{
				providerId,
				requestId: parsed.requestId,
				status: parsed.status,
				providerNote: parsed.providerNote ?? null,
			}
		)
		if (!result.ok) {
			const status =
				result.error === "not_found"
					? 404
					: result.error === "invalid_transition"
						? 409
						: result.error === "validation_error"
							? 400
							: 401
			return json({ error: result.error }, status)
		}
		return json({
			ok: true,
			requestId: result.requestId,
			status: result.status,
			idempotent: result.idempotent,
		})
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: "validation_error", issues: error.issues }, 400)
		}
		console.error("tours/private-request/transition", error)
		return json({ error: "internal_error" }, 500)
	}
}
