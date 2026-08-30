import { z } from "zod"

import { PRICING_BULK_MAX_RATE_PLANS } from "@/modules/pricing/public"

export const pricingBulkOperationSchema = z.object({
	type: z.string().trim().min(1),
	value: z.number().refine(Number.isFinite, { message: "Expected a finite value" }),
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
})

export const pricingBulkRequestSchema = z.object({
	ratePlanIds: z.array(z.string().trim().min(1)).min(1).max(PRICING_BULK_MAX_RATE_PLANS),
	operation: pricingBulkOperationSchema,
	dryRun: z.boolean().optional(),
	concurrency: z.number().int().min(1).max(10).optional(),
})

export const pricingBulkJobRequestSchema = pricingBulkRequestSchema.extend({
	operation: pricingBulkOperationSchema,
	idempotencyKey: z.string().trim().min(1).max(200).optional(),
	maxAttempts: z.number().int().min(1).max(10).optional(),
	mode: z.enum(["apply", "preview"]).optional(),
})

export function requestIdempotencyKey(request: Request, bodyKey?: string): string | null {
	const headerKey = String(request.headers.get("idempotency-key") ?? "").trim()
	const normalizedBodyKey = String(bodyKey ?? "").trim()
	if (headerKey && normalizedBodyKey && headerKey !== normalizedBodyKey) return null
	return headerKey || normalizedBodyKey || null
}

export function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}
