import type { APIRoute } from "astro"

import { cleanupExpiredCommandIdempotency } from "@/lib/commands/command-idempotency"
import { verifyCronAuthorization } from "@/lib/provider-external-calendar-scheduler"

export const prerender = false
export const maxDuration = 60

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	})
}

/** Deletes at most 250 completed, expired idempotency records per run. */
export const GET: APIRoute = async ({ request }) => {
	const authorization = verifyCronAuthorization(request.headers.get("authorization"))
	if (authorization === "misconfigured") {
		return json({ ok: false, error: "cron_secret_not_configured" }, 503)
	}
	if (authorization !== "authorized") return json({ ok: false, error: "unauthorized" }, 401)

	try {
		const deleted = await cleanupExpiredCommandIdempotency({ limit: 250 })
		return json({ ok: true, deleted })
	} catch (error) {
		return json(
			{
				ok: false,
				error: "command_idempotency_cleanup_failed",
				message: error instanceof Error ? error.message : "Unknown cleanup error",
			},
			500
		)
	}
}
