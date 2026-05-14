import type { APIRoute } from "astro"

import {
	financialReferenceRepository,
	financialReviewEventRepository,
} from "@/container/financial.container"
import { recordFinancialReference } from "@/modules/financial/application/use-cases/record-financial-reference"
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
			recordedAt: body.recordedAt ? new Date(String(body.recordedAt)) : new Date(),
			source: (String(body.source ?? "operator_entry") ||
				"operator_entry") as FinancialReferenceSource,
			basis: (String(body.basis ?? "external_reference") ||
				"external_reference") as FinancialReferenceBasis,
			linkedExceptionId: String(body.linkedExceptionId ?? "").trim() || null,
			actorId,
		}
	)
	return json(result, result.created ? 201 : 200)
}
