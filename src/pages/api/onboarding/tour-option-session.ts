import type { APIRoute } from "astro"
import { z } from "zod"
import { requireProvider } from "@/lib/auth/requireProvider"
import {
	startOptionSession,
	handoffFirstOption,
	saveOptionSession,
	finishOptionSession,
	sessionHref,
} from "@/lib/onboarding/tourOptionSession"
import { reviewScheduleSource } from "@/lib/onboarding/tourScheduleCreation"
import { PreparationSessionError } from "@/lib/onboarding/preparationSessionContext"
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	})
export const POST: APIRoute = async ({ request }) => {
	const isForm = !request.headers.get("content-type")?.includes("application/json")
	let recovery: string | null = null
	try {
		const { providerId, user } = await requireProvider(request)
		const body = isForm ? Object.fromEntries(await request.formData()) : await request.json()
		if (body.action === "start") {
			if (
				isForm &&
				body.entryIntent === "first_publication" &&
				z.string().uuid().safeParse(body.productId).success
			)
				recovery = `/product/${body.productId}/preparation-complete`
			let selected: { variantId?: string; ratePlanId?: string } = {}
			if (typeof body.offer === "string" && body.offer) {
				try {
					selected = z
						.object({
							variantId: z.string().uuid().optional(),
							ratePlanId: z.string().uuid().optional(),
						})
						.parse(JSON.parse(body.offer))
				} catch {
					throw new PreparationSessionError("invalid_selection", 422)
				}
			}
			const session = await startOptionSession(
				providerId,
				user.id,
				String(body.productId || ""),
				String(body.sessionId || ""),
				body.sourceVariantId ? String(body.sourceVariantId) : undefined,
				body.entryIntent === "first_publication" ? "first_publication" : "additional_option",
				{
					variantId: selected.variantId || (body.variantId ? String(body.variantId) : undefined),
					ratePlanId:
						selected.ratePlanId || (body.ratePlanId ? String(body.ratePlanId) : undefined),
				}
			)
			return isForm
				? new Response(null, { status: 303, headers: { Location: sessionHref(session) } })
				: json({ session, href: sessionHref(session) })
		}
		if (body.action === "handoff_to_publication") {
			if (isForm) {
				const referer = request.headers.get("referer")
				if (referer) {
					const url = new URL(referer)
					if (
						url.origin === new URL(request.url).origin &&
						/^\/product\/[^/]+\/departures\/[^/]+\/review$/.test(url.pathname)
					)
						recovery = url.pathname + url.search
				}
			}
			const href = await handoffFirstOption(providerId, user.id, String(body.sessionId || ""))
			return isForm
				? new Response(null, { status: 303, headers: { Location: href } })
				: json({ href })
		}

		if (body.action === "review_source") {
			const session = await reviewScheduleSource(
				providerId,
				user.id,
				String(body.sessionId || ""),
				String(body.sourceRatePlanId || "")
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
		if (isForm && recovery) {
			const url = new URL(recovery, "http://fastt.local")
			url.searchParams.set("sessionError", "retry")
			return new Response(null, { status: 303, headers: { Location: url.pathname + url.search } })
		}
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
