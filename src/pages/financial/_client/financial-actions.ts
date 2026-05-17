export type ReviewAction = "acknowledge" | "resolve" | "dismiss"
export type RefundHandoffAction = "acknowledge" | "close" | "dismiss"

async function postJson(endpoint: string, body: Record<string, unknown>): Promise<Response> {
	return fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json", "accept": "application/json" },
		body: JSON.stringify(body),
	})
}

export function buildReviewActionRequest(params: {
	persistedId: string
	action: ReviewAction
	resolutionNote: string
}): { endpoint: string; body: Record<string, unknown> } {
	return {
		endpoint: `/api/internal/financial/exceptions/${encodeURIComponent(params.persistedId)}/${params.action}`,
		body: params.action === "acknowledge" ? {} : { resolutionNote: params.resolutionNote },
	}
}

export async function submitFinancialReviewAction(params: {
	persistedId: string
	action: ReviewAction
	resolutionNote: string
}): Promise<Response> {
	const request = buildReviewActionRequest(params)
	return postJson(request.endpoint, request.body)
}

export async function submitFinancialReference(params: {
	bookingId: string
	type: string
	referenceValue: string
	externalSystem: string | null
	amount: number | null
	currency: string | null
	note: string
	linkedExceptionId: string | null
}): Promise<Response> {
	return postJson("/api/internal/financial/references", {
		...params,
		source: "operator_entry",
		basis: "external_reference",
	})
}

export async function submitRefundHandoffReview(params: {
	handoffId: string
	action: RefundHandoffAction
	resolutionNote: string
}): Promise<Response> {
	return postJson(
		`/api/internal/financial/refund-handoffs/${encodeURIComponent(params.handoffId)}/${params.action}`,
		params.action === "acknowledge" ? {} : { resolutionNote: params.resolutionNote }
	)
}

export async function submitReconciliationReviewMarker(params: {
	bookingId: string
	reviewNote: string | null
}): Promise<Response> {
	return postJson("/api/internal/financial/reconciliation-matches/review", params)
}
