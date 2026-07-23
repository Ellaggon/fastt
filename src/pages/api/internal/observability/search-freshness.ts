import type { APIRoute } from "astro"

import { getSearchFreshnessMonitor } from "@/lib/search/searchFreshnessMonitor"

export const GET: APIRoute = async ({ url }) => {
	try {
		const maxLagMinutes = Number(url.searchParams.get("maxLagMinutes") ?? 30)
		const monitor = await getSearchFreshnessMonitor({ maxLagMinutes })
		return new Response(JSON.stringify(monitor), {
			status: monitor.ok ? 200 : 503,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "private, max-age=20",
				"X-Fastt-Cache": monitor.cacheState,
			},
		})
	} catch (error) {
		return new Response(
			JSON.stringify({
				ok: false,
				error: error instanceof Error ? error.message : "internal_error",
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		)
	}
}
