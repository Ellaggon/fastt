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

export async function submitExternalEvidenceAssociation(params: {
	evidenceType: "payment" | "settlement"
	evidenceId: string
	bookingId: string
	reason: string
}): Promise<Response> {
	return postJson("/api/internal/financial/evidence/associate", params)
}

export async function searchFinancialBookingCandidates(
	query: string,
	options: { signal?: AbortSignal } = {}
): Promise<FinancialBookingCandidate[]> {
	const params = new URLSearchParams({ limit: "10" })
	if (query.trim()) params.set("q", query.trim())
	const response = await fetch(`/api/internal/financial/booking-candidates?${params.toString()}`, {
		headers: { accept: "application/json" },
		signal: options.signal,
	})
	if (!response.ok) throw new Error("financial_booking_candidate_search_failed")
	const body = await response.json()
	return Array.isArray(body?.items) ? body.items : []
}

export type FinancialBookingCandidate = {
	id: string
	guestName: string | null
	guestEmail: string | null
	productName: string | null
	variantName: string | null
	checkIn: string | null
	checkOut: string | null
	currency: string
	totalAmount: number
	status: string
	externalBookingId: string | null
}
