import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import { loadMultiCalendarWorkspace } from "@/lib/rates/loadMultiCalendarWorkspace"

function json(status: number, payload: unknown) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "private, no-store",
		},
	})
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const auth = await requireProvider(request)
		const ratePlanIds = String(url.searchParams.get("ratePlanIds") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean)
		const workspace = await loadMultiCalendarWorkspace({
			request,
			providerId: auth.providerId,
			url,
			ratePlanIds,
		})
		return json(200, workspace)
	} catch (error) {
		if (error instanceof Response) return error
		return json(500, {
			error: error instanceof Error ? error.message : "No se pudo actualizar el multicalendario",
		})
	}
}
