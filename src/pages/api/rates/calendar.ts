import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import { createServerTimingRecorder } from "@/lib/observability/serverTiming"
import { loadProviderRatePlansReadModel } from "@/lib/rates/loadRatePlansReadModel"
import { loadSingleCalendarSurface } from "@/lib/rates/singleCalendarSurface"
import {
	loadTourCommercialEntryContext,
	tourContextValidationResponse,
} from "@/lib/tours/loadTourCommercialContext"

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
		const context = await timing.time("tourContext", () =>
			loadTourCommercialEntryContext({
				providerId: auth.providerId,
				productId: url.searchParams.get("productId") ?? "",
				request,
				url,
			})
		)
		if (context) {
			const contextError = tourContextValidationResponse(context)
			if (contextError) return respondWith(contextError)
			if (context.status === "unresolved")
				return respond(422, {
					error: context.reason,
					message: "Completa la opción y su tarifa antes de abrir este calendario.",
				})
		}
		const rows = await timing.time("ratePlans", () =>
			loadProviderRatePlansReadModel({
				providerId: auth.providerId,
				url,
			})
		)
		if (
			context?.status === "resolved" &&
			!rows.some(
				(row) => row.variantId === context.variantId && row.ratePlanId === context.ratePlanId
			)
		)
			return respond(409, {
				error: "offer_read_model_stale",
				message: "Esta oferta no pudo cargarse. Actualiza e intenta de nuevo.",
			})
		const surface = await loadSingleCalendarSurface({
			rows,
			providerId: auth.providerId,
			ratePlanId:
				context?.status === "resolved" ? context.ratePlanId : url.searchParams.get("ratePlanId"),
			variantId:
				context?.status === "resolved" ? context.variantId : url.searchParams.get("variantId"),
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
