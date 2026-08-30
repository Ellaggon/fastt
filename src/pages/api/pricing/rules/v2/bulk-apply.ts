import type { APIRoute } from "astro"
import { z } from "zod"

import { pricingBulkJobService } from "@/container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { json, requestIdempotencyKey } from "@/lib/pricing/bulk-job-http"
import { PricingBulkJobError, PricingRuleCommandError } from "@/modules/pricing/public"

const bulkSchema = z.object({
	ratePlanIds: z.array(z.string().min(1)).min(1).max(200),
	operation: z.object({
		type: z.string().min(1),
		value: z.number().finite(),
		conditions: z
			.object({
				priority: z.number().int().optional(),
				dateFrom: z.string().optional(),
				dateTo: z.string().optional(),
				dayOfWeek: z.union([z.array(z.number().int().min(0).max(6)), z.string()]).optional(),
				contextKey: z.string().optional(),
				occupancyKey: z.string().optional(),
				currency: z.string().length(3).optional(),
				previewFrom: z.string().optional(),
				previewDays: z.number().int().min(1).max(120).optional(),
				effectiveFrom: z.string().optional(),
				effectiveTo: z.string().optional(),
				effectiveDays: z.number().int().min(1).max(365).optional(),
			})
			.optional(),
	}),
	dryRun: z.boolean().optional(),
	concurrency: z.number().int().min(1).max(10).optional(),
})

export const POST: APIRoute = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as unknown
	const parsed = bulkSchema.safeParse(payload)
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
