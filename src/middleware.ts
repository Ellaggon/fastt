import type { MiddlewareHandler } from "astro"
import { buildWorkspaceRequestContext } from "@/lib/dashboard/workspaceRequestContext"
import { createRequestId } from "@/lib/observability/performanceLog"
import {
	currentRegion,
	runWithRequestContext,
	summarizeCacheEvents,
	type FasttRequestContext,
} from "@/lib/observability/requestContext"

/**
 * Response.redirect() (and some platform Responses) expose immutable headers.
 * Rebuild a mutable Response so we can attach observability headers.
 */
function withObservabilityHeaders(response: Response, headers: Record<string, string>): Response {
	try {
		for (const [key, value] of Object.entries(headers)) {
			response.headers.set(key, value)
		}
		return response
	} catch {
		const nextHeaders = new Headers(response.headers)
		for (const [key, value] of Object.entries(headers)) {
			nextHeaders.set(key, value)
		}
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: nextHeaders,
		})
	}
}

function appendServerTiming(response: Response, totalMs: number): void {
	const existing = response.headers.get("Server-Timing")
	const pageTotalMatch = existing?.match(/(?:^|,)\s*total;dur=([\d.]+)/)
	const pageDataMs = Number(pageTotalMatch?.[1] ?? 0)
	const renderMs = Math.max(0, totalMs - (Number.isFinite(pageDataMs) ? pageDataMs : 0))
	const metrics = [
		`request;dur=${totalMs.toFixed(1)};desc="whole server response"`,
		`render;dur=${renderMs.toFixed(1)};desc="response after page data"`,
	]
	response.headers.set("Server-Timing", [existing, ...metrics].filter(Boolean).join(", "))
}

export const onRequest: MiddlewareHandler = async (context, next) => {
	const requestContext: FasttRequestContext = {
		id: createRequestId(),
		startedAt: performance.now(),
		cacheEvents: [],
	}
	let workspaceContextPromise: ReturnType<typeof buildWorkspaceRequestContext> | null = null
	context.locals.getWorkspaceContext = () => {
		workspaceContextPromise ??= buildWorkspaceRequestContext(context.request)
		return workspaceContextPromise
	}

	return runWithRequestContext(requestContext, async () => {
		const response = await next()
		const totalMs = performance.now() - requestContext.startedAt
		const cache = summarizeCacheEvents(requestContext.cacheEvents)
		const observedResponse = withObservabilityHeaders(response, {
			"X-Fastt-Region": currentRegion(),
			"X-Fastt-Request-Id": requestContext.id,
			"X-Fastt-Cache": cache.state,
			"X-Fastt-Cache-Detail": cache.detail,
		})
		appendServerTiming(observedResponse, totalMs)
		return observedResponse
	})
}
