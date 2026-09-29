import type { APIRoute } from "astro"

import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import {
	findInternalSupportRequest,
	parseSupportBody,
	parseSupportKey,
	parseSupportInboxFilter,
	parseSupportInboxPage,
	ProviderSupportError,
	replyToProviderSupport,
} from "@/lib/provider-support"

function respond(
	request: Request,
	payload: Record<string, unknown>,
	status: number,
	requestId: string,
	returnStatus: string = "open",
	returnPage = 1
) {
	if ((request.headers.get("accept") ?? "").includes("text/html")) {
		const target = new URL("/admin/support", request.url)
		target.searchParams.set("status", returnStatus)
		target.searchParams.set("page", String(returnPage))
		target.searchParams.set("request", requestId)
		target.searchParams.set(
			status < 400 ? "result" : "error",
			status < 400 ? "replied" : String(payload.error)
		)
		return Response.redirect(target, 303)
	}
	return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } })
}

export const POST: APIRoute = async ({ request, params }) => {
	const requestId = String(params.requestId ?? "")
	const origin = request.headers.get("origin")
	if (
		(origin && origin !== new URL(request.url).origin) ||
		request.headers.get("sec-fetch-site") === "cross-site"
	)
		return respond(request, { error: "invalid_origin" }, 403, requestId)
	const reader = await requireInternalPermission(request, "provider.compliance.read").catch(
		(error: unknown) => {
			if (error instanceof Response) return error
			throw error
		}
	)
	if (reader instanceof Response) return reader
	const thread = await findInternalSupportRequest(requestId)
	if (!thread) return respond(request, { error: "not_found" }, 404, requestId)
	const principal = await requireInternalPermission(request, "case.assign", {
		type: "provider",
		id: thread.providerId,
	}).catch((error: unknown) => {
		if (error instanceof Response) return error
		throw error
	})
	if (principal instanceof Response) return principal
	let returnStatus = "open"
	let returnPage = 1
	try {
		const form = await request.formData()
		returnStatus = parseSupportInboxFilter(form.get("returnStatus"))
		returnPage = parseSupportInboxPage(String(form.get("returnPage") ?? "1"))
		const body = parseSupportBody(form.get("body"))
		const requestKey = parseSupportKey(form.get("requestKey"))
		const status = String(form.get("status") ?? "")
		if (status !== "waiting_provider" && status !== "resolved")
			return respond(request, { error: "invalid_status" }, 422, requestId, returnStatus, returnPage)
		await replyToProviderSupport({
			requestId,
			actorUserId: principal.user.id,
			authorRole: "internal",
			body,
			requestKey,
			status,
		})
		return respond(request, { ok: true, requestId }, 200, requestId, status, 1)
	} catch (error) {
		if (error instanceof ProviderSupportError)
			return respond(
				request,
				{ error: error.code },
				error.status,
				requestId,
				returnStatus,
				returnPage
			)
		console.error("provider.support.internal_reply_failed", error)
		return respond(
			request,
			{ error: "support_unavailable" },
			503,
			requestId,
			returnStatus,
			returnPage
		)
	}
}
