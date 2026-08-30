import type { APIRoute } from "astro"

import { pricingBulkJobService } from "@/container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { json, pricingBulkRequestSchema, requestIdempotencyKey } from "@/lib/pricing/bulk-job-http"
import { PricingBulkJobError, PricingRuleCommandError } from "@/modules/pricing/public"

export const POST: APIRoute = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as unknown
	const parsed = pricingBulkRequestSchema.safeParse(payload)
	if (!parsed.success) {
		return new Response(
			JSON.stringify({ error: "validation_error", details: parsed.error.issues }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
	try {
		if (parsed.data.dryRun) return json(400, { error: "use_bulk_preview_for_dry_run" })
		const idempotencyKey = requestIdempotencyKey(request)
		if (!idempotencyKey) return json(400, { error: "idempotency_key_required" })
		const { providerId, user } = await requireProvider(request)
		const result = await pricingBulkJobService.enqueue({
			providerId,
			requestedByUserId: user.id,
			input: {
				ratePlanIds: parsed.data.ratePlanIds,
				operation: parsed.data.operation,
				idempotencyKey,
			},
		})
		return json(202, { ...result, location: `/api/pricing/bulk-jobs/${result.job.id}` })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof PricingBulkJobError || error instanceof PricingRuleCommandError)
			return json(error.status, { error: error.code })
		throw error
	}
}
