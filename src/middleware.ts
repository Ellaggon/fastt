import type { MiddlewareHandler } from "astro"
import { createRequestId } from "@/lib/observability/performanceLog"
import {
	currentRegion,
	runWithRequestContext,
	summarizeCacheEvents,
	type FasttRequestContext,
} from "@/lib/observability/requestContext"

export const onRequest: MiddlewareHandler = async (_context, next) => {
	const requestContext: FasttRequestContext = {
		id: createRequestId(),
		startedAt: performance.now(),
		cacheEvents: [],
	}
	return runWithRequestContext(requestContext, async () => {
		const response = await next()
		const cache = summarizeCacheEvents(requestContext.cacheEvents)
		response.headers.set("X-Fastt-Region", currentRegion())
		response.headers.set("X-Fastt-Request-Id", requestContext.id)
		response.headers.set("X-Fastt-Cache", cache.state)
		response.headers.set("X-Fastt-Cache-Detail", cache.detail)
		return response
	})
}
