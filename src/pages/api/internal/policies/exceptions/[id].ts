import type { APIRoute } from "astro"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import { setPolicyExceptionRuleActiveUseCase } from "@/container/policy-exceptions.container"

function json(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

async function readIsActive(request: Request): Promise<boolean | null> {
	const contentType = request.headers.get("content-type") ?? ""
	if (contentType.includes("application/json")) {
		const body = await request.json().catch(() => ({}))
		if (typeof body?.isActive === "boolean") return body.isActive
		if (body?.isActive === "true") return true
		if (body?.isActive === "false") return false
		return null
	}
	const form = await request.formData()
	const raw = String(form.get("isActive") ?? "").trim()
	if (raw === "true") return true
	if (raw === "false") return false
	return null
}

export const PATCH: APIRoute = async ({ request, params }) => {
	let auth: Awaited<ReturnType<typeof requireInternalAdmin>>
	try {
		auth = await requireInternalAdmin(request)
	} catch (response) {
		if (response instanceof Response) return response
		throw response
	}
	const id = String(params.id ?? "").trim()
	if (!id) return json({ error: "id_required" }, 400)
	const isActive = await readIsActive(request)
	if (typeof isActive !== "boolean") return json({ error: "isActive_required" }, 400)
	const item = await setPolicyExceptionRuleActiveUseCase({
		id,
		isActive,
		actorUserId: auth.user.email,
	})
	if (!item) return json({ error: "not_found" }, 404)
	return json({ item })
}
