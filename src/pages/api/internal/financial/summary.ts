import type { APIRoute } from "astro"

import { readCounter } from "@/lib/observability/metrics"

export const GET: APIRoute = async () => {
	const created = readCounter("financial.shadow_write.created", { source: "booking_confirm" })
	const deduped = readCounter("financial.shadow_write.deduped", { source: "booking_confirm" })
	const failed = readCounter("financial.shadow_write.failed", { source: "booking_confirm" })
	const shadowWrites = created + deduped + failed

	const observed = readCounter("financial.reconciliation.observed")
	const mismatch = readCounter("financial.reconciliation.mismatch")
	const missing = readCounter("financial.reconciliation.missing")
	const ok = Math.max(0, observed - mismatch - missing)

	return new Response(
		JSON.stringify({
			totals: {
				bookingsObserved: observed,
				shadowWrites,
				deduped,
				failed,
			},
			reconciliation: {
				ok,
				mismatch,
				missing,
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
