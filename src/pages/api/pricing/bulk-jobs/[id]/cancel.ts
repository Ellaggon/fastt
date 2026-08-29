import type { APIRoute } from "astro"

import { pricingBulkJobService } from "@/container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { json } from "@/lib/pricing/bulk-job-http"
import { PricingBulkJobError } from "@/modules/pricing/public"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const { providerId, user } = await requireProvider(request)
		const job = await pricingBulkJobService.cancelQueued({
			providerId,
			requestedByUserId: user.id,
			jobId: String(params.id ?? ""),
		})
		return json(200, { job })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof PricingBulkJobError) {
			return json(error.status, { error: error.code })
		}
		throw error
	}
}
