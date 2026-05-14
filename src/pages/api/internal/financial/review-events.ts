import type { APIRoute } from "astro"

import { financialReviewEventRepository } from "@/container/financial.container"

import { json, requireFinancialProvider } from "./_stage2"

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const bookingId = String(url.searchParams.get("bookingId") ?? "").trim() || undefined
	const financialExceptionId = String(url.searchParams.get("exceptionId") ?? "").trim() || undefined
	const refundHandoffId = String(url.searchParams.get("refundHandoffId") ?? "").trim() || undefined
	const limit = Number(url.searchParams.get("limit") ?? 100)
	const items = await financialReviewEventRepository.findByProvider({
		providerId: auth.providerId,
		bookingId,
		financialExceptionId,
		refundHandoffId,
		limit,
	})
	return json({ items })
}
