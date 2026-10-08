import type { MiddlewareHandler } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOptionSession } from "@/lib/onboarding/tourOptionSession"
import { PreparationSessionError } from "@/lib/onboarding/preparationSessionContext"
import { optionWizardContext } from "@/lib/playbook/add-tour-option"
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
import { buildEstadoServicioResponse } from "@/lib/platform/estadoServicioResponse"
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
			const optionContext = optionWizardContext(context.url)
			if (optionContext && !context.url.pathname.startsWith("/api/")) {
				try {
					const { providerId, user } = await requireProvider(context.request, {
						unauthorizedResponse: context.redirect(
							`/SignInPage?returnTo=${encodeURIComponent(context.url.pathname + context.url.search)}`
						),
					})
					const session = await getOptionSession(
						providerId,
						user.id,
						optionContext.sessionId,
						optionContext.productId
					)
					if (session.status !== "active")
						return context.redirect(`/product/${encodeURIComponent(session.productId!)}/departures`)
					if (
						(session.variantId &&
							optionContext.variantId &&
							session.variantId !== optionContext.variantId) ||
						(session.ratePlanId &&
							optionContext.ratePlanId &&
							session.ratePlanId !== optionContext.ratePlanId)
					)
						return new Response("La selección no corresponde a este recorrido.", { status: 409 })
					context.locals.optionPreparationSession = session
				} catch (error) {
					if (error instanceof Response) return error
					if (error instanceof PreparationSessionError)
						return new Response("Recorrido no encontrado. Vuelve a Opciones y horarios.", {
							status: error.status,
						})
					throw error
				}
			}
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
			if (url.pathname === "/estado-servicio") {
				const retryHref = sanitizeReturnTo(url.searchParams.get("next"), "/")
				return buildEstadoServicioResponse(retryHref)
			}
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
