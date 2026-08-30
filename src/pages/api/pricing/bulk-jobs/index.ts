import type { APIRoute } from "astro"

import { pricingBulkJobService } from "@/container"
import { requireProvider } from "@/lib/auth/requireProvider"
import {
	json,
	pricingBulkJobRequestSchema,
	requestIdempotencyKey,
} from "@/lib/pricing/bulk-job-http"
import { PricingBulkJobError, PricingRuleCommandError } from "@/modules/pricing/public"

export const POST: APIRoute = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as unknown
	const parsed = pricingBulkJobRequestSchema.safeParse(payload)
	if (!parsed.success) return json(400, { error: "validation_error", details: parsed.error.issues })
	const ratePlanIds = parsed.data.ratePlanIds
	if (!ratePlanIds.length) return json(400, { error: "ratePlanIds_required" })
	const idempotencyKey = requestIdempotencyKey(request, parsed.data.idempotencyKey)
	if (!idempotencyKey) return json(400, { error: "idempotency_key_required" })

	try {
		const { providerId, user } = await requireProvider(request)
		const result = await pricingBulkJobService.enqueue({
			providerId,
			requestedByUserId: user.id,
			input: { ...parsed.data, ratePlanIds, idempotencyKey },
		})
		return json(202, { ...result, location: `/api/pricing/bulk-jobs/${result.job.id}` })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof PricingBulkJobError || error instanceof PricingRuleCommandError) {
			return json(error.status, { error: error.code })
		}
		throw error
	}
}
