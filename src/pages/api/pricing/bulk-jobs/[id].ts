import type { APIRoute } from "astro"

import { pricingBulkJobService } from "@/container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { json } from "@/lib/pricing/bulk-job-http"
import { PricingBulkJobError } from "@/modules/pricing/public"

export const GET: APIRoute = async ({ request, params }) => {
	try {
		const { providerId } = await requireProvider(request)
		const result = await pricingBulkJobService.get({ providerId, jobId: String(params.id ?? "") })
		if (!result) return json(404, { error: "bulk_job_not_found" })
		return json(200, result)
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof PricingBulkJobError) return json(error.status, { error: error.code })
		throw error
	}
}
