import type { APIRoute } from "astro"
import { logger } from "@/lib/observability/logger"
import { currentRegion } from "@/lib/observability/requestContext"

function finiteNumber(value: unknown): number | null {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return null
	return Number(parsed.toFixed(1))
}

function cleanPath(value: unknown): string {
	const raw = String(value ?? "/").trim()
	if (!raw.startsWith("/")) return "/"
	return raw.slice(0, 300)
}

export const POST: APIRoute = async ({ request }) => {
	let body: Record<string, unknown> = {}
	try {
		body = (await request.json()) as Record<string, unknown>
	} catch {
		return new Response(null, { status: 204 })
	}

	const event = String(body.event ?? "rum").slice(0, 80)
	logger.info("rum.web_vital", {
		metricEvent: event,
		pathname: cleanPath(body.pathname),
		referrerPathname: cleanPath(body.referrerPathname),
		region: currentRegion(),
		ttfbMs: finiteNumber(body.ttfbMs),
		lcpMs: finiteNumber(body.lcpMs),
		inpMs: finiteNumber(body.inpMs),
		routeTransitionMs: finiteNumber(body.routeTransitionMs),
		navigationType: String(body.navigationType ?? "").slice(0, 40),
		visibilityState: String(body.visibilityState ?? "").slice(0, 40),
	})

	return new Response(null, {
		status: 204,
		headers: {
			"Cache-Control": "no-store",
			"X-Fastt-Region": currentRegion(),
		},
	})
}
