import type { APIRoute } from "astro"

import { verifyCronAuthorization } from "@/lib/provider-external-calendar-scheduler"
import { runPricingBulkJobWorker } from "@/lib/pricing/pricing-bulk-job-worker"

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

/** Internal scheduler entrypoint. Bulk pricing never runs through an end-user request. */
export const GET: APIRoute = async ({ request }) => {
	const authorization = verifyCronAuthorization(request.headers.get("authorization"))
	if (authorization === "misconfigured") {
		return json({ ok: false, error: "cron_secret_not_configured" }, 503)
	}
	if (authorization !== "authorized") {
		return json({ ok: false, error: "unauthorized" }, 401)
	}

	try {
		const result = await runPricingBulkJobWorker()
		return json({ ok: true, ...result })
	} catch (error) {
		return json(
			{
				ok: false,
				error: "pricing_bulk_job_worker_failed",
				message: error instanceof Error ? error.message : "Unknown worker error",
			},
			500
		)
	}
}
