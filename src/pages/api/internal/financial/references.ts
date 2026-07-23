import type { APIRoute } from "astro"

import {
	financialExceptionRepository,
	financialReferenceRepository,
	financialReviewEventRepository,
} from "@/container/financial.container"
import { invalidateFinancialProviderSummary } from "@/lib/cache/invalidation"
import { recordFinancialReference } from "@/modules/financial/public"
import type {
	FinancialReferenceBasis,
	FinancialReferenceSource,
	FinancialReferenceType,
} from "@/modules/financial/public"

import { bookingBelongsToProvider, json, readJson, requireFinancialProvider } from "./_stage2"

const allowedTypes = new Set([
	"payment_evidence",
	"refund_evidence",
	"settlement_evidence",
	"invoice_reference",
])
const allowedSources = new Set(["operator_entry", "legacy_payload", "import"])
const allowedBasis = new Set([
	"financial_evidence",
	"external_reference",
	"contract_snapshot",
	"legacy_payload",
])

export const GET: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const url = new URL(request.url)
	const bookingIds = [
		...String(url.searchParams.get("bookingIds") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		...String(url.searchParams.get("bookingId") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	]
	const limit = Number(url.searchParams.get("limit") ?? 500)
	try {
		const items = await financialReferenceRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: Number.isFinite(limit) ? limit : 500,
		})
		return json({ items })
	} catch (error) {
		console.warn("financial_reference_lookup_degraded", {
			providerId: auth.providerId,
			error: error instanceof Error ? error.message : "unknown",
		})
		return json({ items: [], degraded: true })
	}
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const body = await readJson(request)
	const bookingId = String(body.bookingId ?? "").trim()
	const type = String(body.type ?? "").trim() as FinancialReferenceType
	const referenceValue = String(body.referenceValue ?? "").trim()
	if (!bookingId || !referenceValue || !allowedTypes.has(type)) {
		return json({ error: "validation_error" }, 400)
	}
	if (!(await bookingBelongsToProvider(bookingId, auth.providerId)))
		return json({ error: "not_found" }, 404)
	const amount = body.amount == null ? null : Number(body.amount)
	if (amount != null && !Number.isFinite(amount)) return json({ error: "validation_error" }, 400)
	const recordedAt = body.recordedAt ? new Date(String(body.recordedAt)) : new Date()
	if (Number.isNaN(recordedAt.getTime())) return json({ error: "validation_error" }, 400)
	const source = String(body.source ?? "operator_entry").trim() || "operator_entry"
	const basis = String(body.basis ?? "external_reference").trim() || "external_reference"
	if (!allowedSources.has(source) || !allowedBasis.has(basis))
		return json({ error: "validation_error" }, 400)
	const linkedExceptionId = String(body.linkedExceptionId ?? "").trim() || null
	if (linkedExceptionId) {
		const linked = await financialExceptionRepository.findByIdForProvider(
			linkedExceptionId,
			auth.providerId
		)
		if (!linked || linked.bookingId !== bookingId) return json({ error: "not_found" }, 404)
	}
	const actorId = String((auth.user as any)?.id ?? "").trim() || String(auth.user.email)
	const result = await recordFinancialReference(
		{ references: financialReferenceRepository, events: financialReviewEventRepository },
		{
			bookingId,
			providerId: auth.providerId,
			type,
			referenceValue,
			externalSystem: String(body.externalSystem ?? "").trim() || null,
			amount,
			currency: String(body.currency ?? "").trim() || null,
			recordedAt,
			source: source as FinancialReferenceSource,
			basis: basis as FinancialReferenceBasis,
			linkedExceptionId,
			actorId,
			note: String(body.note ?? "").trim() || null,
		}
	)
	if (result.created) {
		void invalidateFinancialProviderSummary({
			providerId: auth.providerId,
			reason: "financial_reference_recorded",
		})
	}
	return json(result, result.created ? 201 : 200)
}
