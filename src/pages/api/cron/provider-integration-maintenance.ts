import type { APIRoute } from "astro"

import { verifyCronAuthorization } from "@/lib/provider-external-calendar-scheduler"
import { purgeProviderIntegrationOperationalData } from "@/lib/provider-integration-maintenance"

export const prerender = false

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	})
}

export const GET: APIRoute = async ({ request }) => {
	const authorization = verifyCronAuthorization(request.headers.get("authorization"))
	if (authorization === "misconfigured") {
		return json({ ok: false, error: "cron_secret_not_configured" }, 503)
	}
	if (authorization !== "authorized") {
		return json({ ok: false, error: "unauthorized" }, 401)
	}

	try {
		const result = await purgeProviderIntegrationOperationalData()
		return json({ ok: true, ...result })
	} catch (error) {
		return json(
			{
				ok: false,
				error: "provider_integration_maintenance_failed",
				message: error instanceof Error ? error.message : "Unknown maintenance error",
			},
			500
		)
	}
}
