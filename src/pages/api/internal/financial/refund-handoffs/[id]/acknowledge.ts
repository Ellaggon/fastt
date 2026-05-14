import type { APIRoute } from "astro"

import {
	financialReviewEventRepository,
	refundHandoffRepository,
} from "@/container/financial.container"
import { acknowledgeRefundHandoff } from "@/modules/financial/application/use-cases/acknowledge-refund-handoff"

import { json, requireFinancialProvider } from "../../_stage2"

export const POST: APIRoute = async ({ params, request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const id = String(params.id ?? "").trim()
	if (!id) return json({ error: "validation_error", details: "id is required" }, 400)
	const result = await acknowledgeRefundHandoff(
		{ handoffs: refundHandoffRepository, events: financialReviewEventRepository },
		{
			providerId: auth.providerId,
			refundHandoffId: id,
			actorId: String((auth.user as any)?.id ?? "") || null,
		}
	)
	if (!result) return json({ error: "not_found" }, 404)
	return json(result)
}
