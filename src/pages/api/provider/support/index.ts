import type { APIRoute } from "astro"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { notifyProviderSupportTeam } from "@/lib/email/providerSupportAlertEmail"
import {
	createProviderSupport,
	findProviderSupportRequest,
	parseSupportBody,
	parseSupportKey,
	parseSupportLine,
	parseSupportTopic,
	ProviderSupportError,
	replyToProviderSupport,
} from "@/lib/provider-support"
import { routes } from "@/lib/routes"

function respond(
	request: Request,
	payload: Record<string, unknown>,
	status: number,
	requestId?: string,
	returnTo?: URL | null
) {
	if ((request.headers.get("accept") ?? "").includes("text/html")) {
		const target = returnTo ?? new URL(routes.providerSupport(), request.url)
		if (requestId) target.searchParams.set("request", requestId)
		target.searchParams.set(
			status < 400 ? "result" : "error",
			status < 400 ? "sent" : String(payload.error)
		)
		return Response.redirect(target, 303)
	}
	return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } })
}

function parseSafeReturnTo(request: Request, value: FormDataEntryValue | null): URL | null {
	if (typeof value !== "string") return null
	try {
		const target = new URL(value, request.url)
		return target.origin === new URL(request.url).origin &&
			target.pathname === routes.providerSupport()
			? target
			: null
	} catch {
		return null
	}
}

export const POST: APIRoute = async ({ request }) => {
	const origin = request.headers.get("origin")
	if (origin && origin !== new URL(request.url).origin)
		return respond(request, { error: "invalid_origin" }, 403)
	if (request.headers.get("sec-fetch-site") === "cross-site")
		return respond(request, { error: "invalid_origin" }, 403)
	const session = await requireProviderSessionSurface(request).catch((error: unknown) => {
		if (error instanceof Response) return error
		throw error
	})
	if (session instanceof Response) return session
	let returnTo: URL | null = null
	try {
		const form = await request.formData()
		returnTo = parseSafeReturnTo(request, form.get("returnTo"))
		const providerId = session.provider.providerId
		const userId = session.user.id
		const body = parseSupportBody(form.get("body"))
		const requestKey = parseSupportKey(form.get("requestKey"))
		const replyTo = String(form.get("replyTo") ?? "").trim()
		if (replyTo) {
			const thread = await findProviderSupportRequest(replyTo, providerId)
			if (!thread) return respond(request, { error: "not_found" }, 404, undefined, returnTo)
			const inserted = await replyToProviderSupport({
				requestId: thread.id,
				actorUserId: userId,
				authorRole: "provider",
				body,
				requestKey,
				status: "open",
			})
			if (inserted)
				await notifyProviderSupportTeam({
					event: "provider_reply",
					requestId: thread.id,
					topic: parseSupportTopic(thread.topic) ?? "other",
					line: parseSupportLine(thread.line) ?? "account",
					requestUrl: request.url,
				})
			return respond(request, { ok: true, requestId: thread.id }, 200, thread.id, returnTo)
		}
		const topic = parseSupportTopic(form.get("topic"))
		const line = parseSupportLine(form.get("line"))
		if (!topic || !line || (topic === "historical_tour_collection" && line !== "tour"))
			return respond(request, { error: "invalid_context" }, 422, undefined, returnTo)
		const created = await createProviderSupport({
			providerId,
			userId,
			topic,
			line,
			body,
			requestKey,
		})
		if (created.created)
			await notifyProviderSupportTeam({
				event: "new_request",
				requestId: created.id,
				topic,
				line,
				requestUrl: request.url,
			})
		return respond(request, { ok: true, requestId: created.id }, 201, created.id, returnTo)
	} catch (error) {
		if (error instanceof ProviderSupportError)
			return respond(request, { error: error.code }, error.status, undefined, returnTo)
		console.error("provider.support.submit_failed", error)
		return respond(request, { error: "support_unavailable" }, 503, undefined, returnTo)
	}
}
