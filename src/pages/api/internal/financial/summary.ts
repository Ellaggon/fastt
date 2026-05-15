import type { APIRoute } from "astro"

import { requireFinancialProvider, json } from "./_stage2"
import { readCounter } from "@/lib/observability/metrics"

export const GET: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const created = readCounter("financial.shadow_write.created", { source: "booking_confirm" })
	const deduped = readCounter("financial.shadow_write.deduped", { source: "booking_confirm" })
	const failed = readCounter("financial.shadow_write.failed", { source: "booking_confirm" })
	const shadowWrites = created + deduped + failed

	const observed = readCounter("financial.reconciliation.observed")
	const mismatch = readCounter("financial.reconciliation.mismatch")
	const missing = readCounter("financial.reconciliation.missing")
	const ok = Math.max(0, observed - mismatch - missing)

	return json({
		totals: {
			bookingsObserved: observed,
			shadowWrites,
			deduped,
			failed,
		},
		evidenceComparison: {
			ok,
			mismatch,
			missing,
			basis: "shadow_evidence_visibility",
		},
	})
}
