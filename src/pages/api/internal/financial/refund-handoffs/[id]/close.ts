import type { APIRoute } from "astro"

import {
	financialReviewEventRepository,
	refundHandoffRepository,
} from "@/container/financial.container"
import { closeRefundHandoff } from "@/modules/financial/application/use-cases/close-refund-handoff"

import { json, readJson, requireFinancialProvider } from "../../_stage2"

export const POST: APIRoute = async ({ params, request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const id = String(params.id ?? "").trim()
	if (!id) return json({ error: "validation_error", details: "id is required" }, 400)
	const body = await readJson(request)
	const resolutionNote = String(body.resolutionNote ?? "").trim()
	if (!resolutionNote)
		return json({ error: "validation_error", details: "resolutionNote is required" }, 400)
	const result = await closeRefundHandoff(
		{ handoffs: refundHandoffRepository, events: financialReviewEventRepository },
		{
			providerId: auth.providerId,
			refundHandoffId: id,
			actorId: String((auth.user as any)?.id ?? "") || null,
			resolutionNote,
		}
	)
	if (!result) return json({ error: "not_found" }, 404)
	return json(result)
}
