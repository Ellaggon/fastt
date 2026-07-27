import type { APIRoute } from "astro"

import {
	runScheduledExternalCalendarSync,
	verifyCronAuthorization,
} from "@/lib/provider-external-calendar-scheduler"

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
		const result = await runScheduledExternalCalendarSync()
		return json({
			ok: result.failed === 0,
			...result,
		})
	} catch (error) {
		return json(
			{
				ok: false,
				error: "external_calendar_scheduler_failed",
				message: error instanceof Error ? error.message : "Unknown scheduler error",
			},
			500
		)
	}
}
