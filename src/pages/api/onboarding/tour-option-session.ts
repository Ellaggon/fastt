import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import {
	startOptionSession,
	saveOptionSession,
	finishOptionSession,
	sessionHref,
} from "@/lib/onboarding/tourOptionSession"
import { PreparationSessionError } from "@/lib/onboarding/preparationSessionContext"
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	})
export const POST: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProvider(request)
		const isForm = !request.headers.get("content-type")?.includes("application/json")
		const body = isForm ? Object.fromEntries(await request.formData()) : await request.json()
		if (body.action === "start") {
			const session = await startOptionSession(
				providerId,
				user.id,
				String(body.productId || ""),
				String(body.sessionId || "")
			)
			return isForm
				? new Response(null, { status: 303, headers: { Location: sessionHref(session) } })
				: json({ session, href: sessionHref(session) })
		}
		if (body.action === "abandon") {
			await finishOptionSession(providerId, user.id, String(body.sessionId || ""), "abandoned")
			return json({ ok: true })
		}
		const session = await saveOptionSession(providerId, user.id, {
			sessionId: String(body.sessionId || ""),
			lastPath: String(body.lastPath || ""),
			revision: Number(body.revision),
		})
		return json({ revision: new Date(session.updatedAt).getTime(), href: sessionHref(session) })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof PreparationSessionError)
			return json(
				{
					error: error.code,
					message:
						"No pudimos actualizar este recorrido. Recarga para recuperar su estado guardado.",
				},
				error.status
			)
		console.error("tour-option-session", error)
		return json(
			{
				message:
					"No pudimos guardar el punto de continuación. Reintenta; los datos guardados se conservan.",
			},
			503
		)
	}
}
