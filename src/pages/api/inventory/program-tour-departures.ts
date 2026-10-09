import type { APIRoute } from "astro"
import { z } from "zod"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { tourScheduleSchema } from "@/lib/tours/tourScheduleContract"
import { idempotencyKeyFromRequest, IdempotencyKeyError } from "@/lib/commands/command-idempotency"
import {
	loadTourScheduleContext,
	previewTourDepartures,
	programTourDepartures,
	TourScheduleError,
} from "@/modules/inventory/public"

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	})
const schema = z.object({ input: tourScheduleSchema, token: z.string().optional() }).strict()
const handle: APIRoute = async ({ request, url }) => {
	const user = await getUserFromRequest(request)
	if (!user) return json({ error: "La sesión venció. Inicia sesión para continuar." }, 401)
	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) return json({ error: "No tienes acceso a este negocio" }, 403)
	try {
		if (request.method === "GET")
			return json({
				surface: await loadTourScheduleContext(providerId, url.searchParams.get("variantId") || ""),
			})
		const parsed = schema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return json({ error: "Revisa los campos", details: parsed.error.issues }, 422)
		if (!parsed.data.token) return json(await previewTourDepartures(providerId, parsed.data.input))
		return json(
			await programTourDepartures(
				providerId,
				parsed.data.input,
				parsed.data.token,
				idempotencyKeyFromRequest(request)
			)
		)
	} catch (error) {
		if (error instanceof TourScheduleError) return json({ error: error.message }, error.status)
		if (error instanceof IdempotencyKeyError)
			return json({ error: "Falta una identidad válida de la operación" }, 400)
		return json(
			{ error: "No pudimos completar la operación. Reintenta con los mismos datos." },
			503
		)
	}
}
export const GET = handle
export const POST = handle
