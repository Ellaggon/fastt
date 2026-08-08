import type { APIRoute } from "astro"
import { z } from "zod"
import { tourTrustRepository } from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { createTourPrivateRequest } from "@/modules/catalog/public"

const schema = z.object({
	productId: z.string().trim().min(1),
	variantId: z.string().trim().min(1),
	departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	party: z
		.object({
			adults: z.coerce.number().int().min(1).default(1),
			children: z.coerce.number().int().min(0).default(0),
			infants: z.coerce.number().int().min(0).default(0),
			rooms: z.coerce.number().int().min(1).optional(),
		})
		.default({ adults: 1, children: 0, infants: 0 }),
	contactName: z.string().trim().min(1).max(120),
	contactEmail: z.string().trim().email(),
	contactPhone: z.string().trim().max(40).optional().nullable(),
	message: z.string().trim().max(2000).optional().nullable(),
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
		const parsed = schema.parse(await request.json().catch(() => ({})))
		const result = await createTourPrivateRequest(
			{ repo: tourTrustRepository },
			{
				userId: user?.id ?? null,
				productId: parsed.productId,
				variantId: parsed.variantId,
				departureDate: parsed.departureDate,
				party: parsed.party,
				contactName: parsed.contactName,
				contactEmail: parsed.contactEmail,
				contactPhone: parsed.contactPhone ?? null,
				message: parsed.message ?? null,
			}
		)
		if (!result.ok) {
			const status =
				result.error === "not_found" ? 404 : result.error === "validation_error" ? 400 : 409
			return json({ error: result.error }, status)
		}
		return json({
			ok: true,
			requestId: result.requestId,
			slaDueAt: result.slaDueAt,
			message:
				"Solicitud enviada al proveedor. No se reservó cupo; te contactarán con la cotización.",
		})
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: "validation_error", issues: error.issues }, 400)
		}
		console.error("tours/private-request", error)
		return json({ error: "internal_error" }, 500)
	}
}
