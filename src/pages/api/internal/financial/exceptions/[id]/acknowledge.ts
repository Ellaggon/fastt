import type { APIRoute } from "astro"

import {
	financialExceptionRepository,
	financialReviewEventRepository,
} from "@/container/financial.container"
import { invalidateFinancialProviderSummary } from "@/lib/cache/invalidation"
import { acknowledgeFinancialException } from "@/modules/financial/public"

import { json, requireFinancialProvider } from "../../_stage2"

export const POST: APIRoute = async ({ params, request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const id = String(params.id ?? "").trim()
	if (!id) return json({ error: "validation_error", details: "id is required" }, 400)
	const result = await acknowledgeFinancialException(
		{ exceptions: financialExceptionRepository, events: financialReviewEventRepository },
		{
			providerId: auth.providerId,
			exceptionId: id,
			actorId: String((auth.user as any)?.id ?? "") || null,
		}
	)
	if (!result) return json({ error: "not_found" }, 404)
	void invalidateFinancialProviderSummary({
		providerId: auth.providerId,
		reason: "financial_exception_acknowledged",
	})
	return json(result)
}
