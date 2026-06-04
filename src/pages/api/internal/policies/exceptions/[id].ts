import type { APIRoute } from "astro"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { setPolicyExceptionRuleActiveUseCase } from "@/container/policy-exceptions.container"

const ADMIN_EMAILS = ["ellaggon@proton.me"]

function json(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

async function requireAdmin(request: Request) {
	const user = await getUserFromRequest(request)
	if (!user?.email) return { ok: false as const, response: json({ error: "Unauthorized" }, 401) }
	if (!ADMIN_EMAILS.includes(user.email)) {
		return { ok: false as const, response: json({ error: "Forbidden" }, 403) }
	}
	return { ok: true as const, email: user.email }
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
	const auth = await requireAdmin(request)
	if (!auth.ok) return auth.response
	const id = String(params.id ?? "").trim()
	if (!id) return json({ error: "id_required" }, 400)
	const isActive = await readIsActive(request)
	if (typeof isActive !== "boolean") return json({ error: "isActive_required" }, 400)
	const item = await setPolicyExceptionRuleActiveUseCase({
		id,
		isActive,
		actorUserId: auth.email,
	})
	if (!item) return json({ error: "not_found" }, 404)
	return json({ item })
}
