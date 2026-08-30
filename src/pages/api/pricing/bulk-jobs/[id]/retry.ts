import type { APIRoute } from "astro"

import { pricingBulkJobService } from "@/container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { json } from "@/lib/pricing/bulk-job-http"
import { PricingBulkJobError } from "@/modules/pricing/public"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const { providerId, user } = await requireProvider(request)
		const jobId = String(params.id ?? "")
		const current = await pricingBulkJobService.get({ providerId, jobId })
		if (!current) return json(404, { error: "bulk_job_not_found" })
		const ratePlanIds = [
			...new Set(current.items.map((item) => String(item.ratePlanId)).filter(Boolean)),
		]
		if (!ratePlanIds.length) return json(409, { error: "bulk_job_rate_plan_scope_missing" })
		const job = await pricingBulkJobService.retryFailed({
			providerId,
			requestedByUserId: user.id,
			jobId,
		})
		return json(202, { job, ratePlanIds })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof PricingBulkJobError) {
			return json(error.status, { error: error.code })
		}
		throw error
	}
}
