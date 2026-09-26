import type { MiddlewareHandler } from "astro"
import { ensureAuthSessionForRequest } from "@/lib/auth/ensureAuthSession"
import { sanitizeReturnTo } from "@/lib/auth/returnTo"
import { buildWorkspaceRequestContext } from "@/lib/dashboard/workspaceRequestContext"
import { createRequestId } from "@/lib/observability/performanceLog"
import {
	currentRegion,
	runWithRequestContext,
	summarizeCacheEvents,
	type FasttRequestContext,
} from "@/lib/observability/requestContext"
import { isTransientDatabaseConnectivityError } from "@/shared/infrastructure/db/connectivity-error"

/**
 * Response.redirect() (and some platform Responses) expose immutable headers.
 * Rebuild a mutable Response so we can attach observability headers.
 */
function appendSetCookieHeaders(response: Response, cookies: string[]): Response {
	if (!cookies.length) return response
	try {
		for (const cookie of cookies) {
			response.headers.append("Set-Cookie", cookie)
		}
		return response
	} catch {
		const nextHeaders = new Headers(response.headers)
		for (const cookie of cookies) {
			nextHeaders.append("Set-Cookie", cookie)
		}
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: nextHeaders,
		})
	}
}

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
		try {
			const refreshedAuthCookies = await ensureAuthSessionForRequest(context.request)
			const response = appendSetCookieHeaders(await next(), refreshedAuthCookies ?? [])
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
		} catch (error) {
			if (!isTransientDatabaseConnectivityError(error)) throw error
			const url = new URL(context.request.url)
			if (url.pathname === "/estado-servicio") throw error
			console.error("[fastt] database connectivity", {
				requestId: requestContext.id,
				path: url.pathname,
				code: error instanceof Error ? error.message : String(error),
			})
			const nextPath = sanitizeReturnTo(`${url.pathname}${url.search}`, "/")
			return context.redirect(`/estado-servicio?next=${encodeURIComponent(nextPath)}`)
		}
	})
}
