import { createHash, randomUUID } from "node:crypto"
import { logger } from "@/lib/observability/logger"
import {
	currentRegion,
	getRequestContext,
	summarizeCacheEvents,
	type FasttRequestContext,
} from "@/lib/observability/requestContext"
import type { ServerTimingRecorder } from "@/lib/observability/serverTiming"

export function createRequestId(): string {
	try {
		return randomUUID()
	} catch {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	}
}

export function hashIdentifier(value: unknown): string | null {
	const normalized = String(value ?? "").trim()
	if (!normalized) return null
	return createHash("sha256").update(normalized).digest("hex").slice(0, 16)
}

function timingPayload(timing?: ServerTimingRecorder) {
	if (!timing) return undefined
	return timing.metrics.map((metric) => ({
		name: metric.name,
		durationMs: metric.durationMs,
	}))
}

export function logRoutePerformance(params: {
	name: string
	request?: Request
	url?: URL
	status?: number
	startedAt: number
	timing?: ServerTimingRecorder
	context?: FasttRequestContext
	userId?: unknown
	providerId?: unknown
	productId?: unknown
	extra?: Record<string, unknown>
}): void {
	const durationMs = Number((performance.now() - params.startedAt).toFixed(1))
	const context = params.context ?? getRequestContext()
	const cache = summarizeCacheEvents(context?.cacheEvents)
	const url = params.url ?? (params.request ? new URL(params.request.url) : undefined)
	const payload = {
		name: params.name,
		pathname: url?.pathname,
		method: params.request?.method,
		status: params.status,
		durationMs,
		region: currentRegion(),
		requestId: context?.id,
		cache: cache.state,
		cacheDetail: cache.detail,
		userHash: hashIdentifier(params.userId),
		providerHash: hashIdentifier(params.providerId),
		productHash: hashIdentifier(params.productId),
		timing: timingPayload(params.timing),
		...params.extra,
	}
	if (durationMs > 1000) {
		logger.warn("route.performance.slow", payload)
		return
	}
	logger.info("route.performance", payload)
}
