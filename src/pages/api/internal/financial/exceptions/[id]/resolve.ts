import type { APIRoute } from "astro"

import {
	financialExceptionRepository,
	financialReviewEventRepository,
} from "@/container/financial.container"
import { invalidateFinancialProviderSummary } from "@/lib/cache/invalidation"
import { resolveFinancialException } from "@/modules/financial/public"

import { json, readJson, requireFinancialProvider } from "../../_stage2"

export const POST: APIRoute = async ({ params, request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const id = String(params.id ?? "").trim()
	const body = await readJson(request)
	const resolutionNote = String(body.resolutionNote ?? "").trim()
	if (!id || !resolutionNote) return json({ error: "validation_error" }, 400)
	const actorId = String((auth.user as any)?.id ?? "").trim() || String(auth.user.email)
	const result = await resolveFinancialException(
		{ exceptions: financialExceptionRepository, events: financialReviewEventRepository },
		{ providerId: auth.providerId, exceptionId: id, actorId, resolutionNote }
	)
	if (!result) return json({ error: "not_found" }, 404)
	void invalidateFinancialProviderSummary({
		providerId: auth.providerId,
		reason: "financial_exception_resolved",
	})
	return json(result)
}
