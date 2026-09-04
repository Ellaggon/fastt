import type { APIRoute } from "astro"
import {
	publishComplianceOutbox,
	reconcileComplianceCases,
} from "@/lib/casework/compliance-casework"
import { verifyCronAuthorization } from "@/lib/provider-external-calendar-scheduler"

export const prerender = false
export const maxDuration = 60

export const GET: APIRoute = async ({ request }) => {
	const authorization = verifyCronAuthorization(request.headers.get("authorization"))
	if (authorization === "misconfigured")
		return Response.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 })
	if (authorization !== "authorized")
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
	try {
		const reconciliation = await reconcileComplianceCases()
		const outbox = await publishComplianceOutbox({ limit: 250 })
		return Response.json(
			{ ok: true, reconciliation, outbox },
			{ headers: { "Cache-Control": "no-store" } }
		)
	} catch (error) {
		return Response.json(
			{
				ok: false,
				error: "compliance_case_reconciliation_failed",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		)
	}
}
