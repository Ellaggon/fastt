import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import { loadRatePlansReadModel } from "@/lib/rates/loadRatePlansReadModel"
import { buildSingleCalendarSurface } from "@/lib/rates/singleCalendarSurface"

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
		await requireProvider(request)
		const rows = await loadRatePlansReadModel({ request, channel: "web" })
		const surface = await buildSingleCalendarSurface({
			rows,
			ratePlanId: url.searchParams.get("ratePlanId"),
			variantId: url.searchParams.get("variantId"),
			month: url.searchParams.get("month"),
		})
		return json(200, { surface })
	} catch (error) {
		if (error instanceof Response) return error
		return json(500, {
			error: error instanceof Error ? error.message : "No se pudo actualizar el calendario",
		})
	}
}
