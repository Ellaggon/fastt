import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import { createServerTimingRecorder } from "@/lib/observability/serverTiming"
import { loadProviderRatePlansReadModel } from "@/lib/rates/loadRatePlansReadModel"
import { loadSingleCalendarSurface } from "@/lib/rates/singleCalendarSurface"

function json(status: number, payload: unknown, headers: HeadersInit) {
	const responseHeaders = new Headers(headers)
	responseHeaders.set("Content-Type", "application/json")
	responseHeaders.set("Cache-Control", "private, no-store")
	return new Response(JSON.stringify(payload), {
		status,
		headers: responseHeaders,
	})
}

export const GET: APIRoute = async ({ request, url }) => {
	const timing = createServerTimingRecorder()
	const timingHeaders = (headers?: HeadersInit) => {
		if (!timing.metrics.some((metric) => metric.name === "sidebar")) {
			timing.add("sidebar", 0, "resolved_by_ssr_shell")
		}
		timing.addTotal("total")
		return timing.headers(headers)
	}
	const respond = (status: number, payload: unknown) => json(status, payload, timingHeaders())
	const respondWith = (response: Response) =>
		new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: timingHeaders(response.headers),
		})
	try {
		const auth = await timing.time("authProvider", () => requireProvider(request))
		const rows = await timing.time("ratePlans", () =>
			loadProviderRatePlansReadModel({
				providerId: auth.providerId,
				url,
			})
		)
		const surface = await loadSingleCalendarSurface({
			rows,
			providerId: auth.providerId,
			ratePlanId: url.searchParams.get("ratePlanId"),
			variantId: url.searchParams.get("variantId"),
			month: url.searchParams.get("month"),
			timing,
		})
		return respond(200, { surface })
	} catch (error) {
		if (error instanceof Response) return respondWith(error)
		return respond(500, {
			error: error instanceof Error ? error.message : "No se pudo actualizar el calendario",
		})
	}
}
