import type { APIRoute } from "astro"
import { z } from "zod"

import { requireProvider } from "@/lib/auth/requireProvider"
import { PricingRuleCommandError, simulateBulkOperation } from "@/modules/pricing/public"

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
		const { providerId } = await requireProvider(request)
		const result = await simulateBulkOperation({
			providerId,
			input: parsed.data,
		})
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		if (error instanceof Response) return error
		if (!(error instanceof PricingRuleCommandError)) throw error
		return new Response(JSON.stringify({ error: error.code }), {
			status: error.status,
			headers: { "Content-Type": "application/json" },
		})
	}
}
