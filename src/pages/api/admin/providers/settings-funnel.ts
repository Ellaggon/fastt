import type { APIRoute } from "astro"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import {
	getSettingsFunnelQueryStatus,
	isSettingsFunnelEventName,
	listProviderSettingsFunnelEvents,
	normalizeSettingsFunnelDomain,
	summarizeProviderSettingsFunnel,
	summarizeProviderSettingsFunnelByDomain,
	type SettingsFunnelEventName,
} from "@/lib/provider-settings-funnel"

/**
 * Queryable settings funnel (P2).
 * Requires SETTINGS_FUNNEL_SINK=db|both for persisted rows; always returns sink status.
 */
export const GET: APIRoute = async ({ request }) => {
	try {
		await requireInternalAdmin(request)
		const url = new URL(request.url)
		const providerId = String(url.searchParams.get("providerId") ?? "").trim() || null
		const limit = Number(url.searchParams.get("limit") ?? 40) || 40
		const eventRaw = String(url.searchParams.get("event") ?? "").trim()
		const event = isSettingsFunnelEventName(eventRaw) ? (eventRaw as SettingsFunnelEventName) : null
		const domain = normalizeSettingsFunnelDomain(url.searchParams.get("domain"))
		const includeEvents = url.searchParams.get("events") !== "0"

		const status = getSettingsFunnelQueryStatus()
		const [summary, byDomain, events] = await Promise.all([
			summarizeProviderSettingsFunnel({ providerId }),
			summarizeProviderSettingsFunnelByDomain({ providerId }),
			includeEvents
				? listProviderSettingsFunnelEvents({
						providerId,
						limit,
						event,
						domain,
					})
				: Promise.resolve([]),
		])

		return new Response(
			JSON.stringify({
				ok: true,
				status,
				summary,
				byDomain,
				events,
			}),
			{
				status: 200,
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": "no-store",
				},
			}
		)
	} catch (e) {
		if (e instanceof Response) return e
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
