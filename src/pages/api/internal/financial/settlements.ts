import type { APIRoute } from "astro"

import { financialSettlementRecordRepository } from "@/container/financial.container"
import { invalidateFinancialProviderSummary } from "@/lib/cache/invalidation"
import type { FinancialSettlementRecordSource } from "@/modules/financial/public"

import { bookingBelongsToProvider, json, readJson, requireFinancialProvider } from "./_stage2"

const allowedSources = new Set(["import", "operator_entry"])

export const GET: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const url = new URL(request.url)
	const bookingIds = String(url.searchParams.get("bookingIds") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean)
	const limit = Number(url.searchParams.get("limit") ?? 500)
	const items = await financialSettlementRecordRepository.findByProvider({
		providerId: auth.providerId,
		bookingIds,
		limit: Number.isFinite(limit) ? limit : 500,
	})
	return json({ items, readOnly: true })
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const body = await readJson(request)
	const bookingId = String(body.bookingId ?? "").trim()
	const settlementReference = String(body.settlementReference ?? "").trim()
	const amount = Number(body.amount)
	const currency = String(body.currency ?? "")
		.trim()
		.toUpperCase()
	const settlementDate = body.settlementDate ? new Date(String(body.settlementDate)) : new Date()
	const source = String(body.source ?? "import").trim() as FinancialSettlementRecordSource
	if (
		!settlementReference ||
		!Number.isFinite(amount) ||
		!currency ||
		Number.isNaN(settlementDate.getTime()) ||
		!allowedSources.has(source)
	) {
		return json({ error: "validation_error" }, 400)
	}
	if (bookingId && !(await bookingBelongsToProvider(bookingId, auth.providerId)))
		return json({ error: "not_found" }, 404)
	const result = await financialSettlementRecordRepository.createIfAbsent({
		bookingId: bookingId || `unmatched:${auth.providerId}:settlement:${settlementReference}`,
		providerId: auth.providerId,
		settlementReference,
		amount,
		currency,
		settlementDate,
		source,
		matchedAt: null,
	})
	if (result.created) {
		void invalidateFinancialProviderSummary({
			providerId: auth.providerId,
			reason: "settlement_recorded",
		})
	}
	return json(result, result.created ? 201 : 200)
}
