import type { APIRoute } from "astro"

import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { deleteCaseView, saveCaseView, listSavedCaseViews } from "@/modules/casework/public"

async function readBody(request: Request) {
	const contentType = request.headers.get("content-type") ?? ""
	if (contentType.includes("application/json"))
		return (await request.json()) as Record<string, unknown>
	return Object.fromEntries(await request.formData())
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const principal = await requireInternalPermission(request, "provider.compliance.read")
		return Response.json({ ok: true, items: await listSavedCaseViews(principal.user.id) })
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json({ error: "saved_views_failed" }, { status: 500 })
	}
}

export const POST: APIRoute = async ({ request, redirect }) => {
	try {
		const principal = await requireInternalPermission(request, "provider.compliance.read")
		const body = await readBody(request)
		const rawFilters = body.filters
		const filters =
			typeof rawFilters === "string"
				? (JSON.parse(rawFilters) as Record<string, string>)
				: ((rawFilters ?? {}) as Record<string, string>)
		const item = await saveCaseView({
			ownerUserId: principal.user.id,
			name: String(body.name ?? ""),
			filters,
		})
		if (!request.headers.get("content-type")?.includes("application/json"))
			return redirect("/admin/cases?notice=view_saved", 303)
		return Response.json({ ok: true, item }, { status: 201 })
	} catch (error) {
		if (error instanceof Response) return error
		const status = Number((error as Error & { status?: number }).status ?? 500)
		return Response.json(
			{ error: error instanceof Error ? error.message : "saved_view_failed" },
			{ status }
		)
	}
}

export const DELETE: APIRoute = async ({ request }) => {
	try {
		const principal = await requireInternalPermission(request, "provider.compliance.read")
		const body = await readBody(request)
		return Response.json({
			ok: true,
			item: await deleteCaseView({ id: String(body.id ?? ""), ownerUserId: principal.user.id }),
		})
	} catch (error) {
		if (error instanceof Response) return error
		const status = Number((error as Error & { status?: number }).status ?? 500)
		return Response.json(
			{ error: error instanceof Error ? error.message : "saved_view_delete_failed" },
			{ status }
		)
	}
}
