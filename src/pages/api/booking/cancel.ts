import type { APIRoute } from "astro"
import { Booking, db, eq } from "@/shared/infrastructure/db/compat"
import { z } from "zod"

import { refundCalculationRepository } from "@/container/financial.container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { invalidateBooking, invalidateFinancialProviderSummary } from "@/lib/cache/invalidation"
import { loadRefundCancellationContext } from "@/lib/financial/refundCancellationContext"
import {
	buildPolicyFinancialPreviewFromSnapshot,
	createRefundQuoteBeforeCancellation,
	recordRefundLedgerFromQuote,
	type RefundQuote,
} from "@/modules/financial/public"

const schema = z.object({
	bookingId: z.string().trim().min(1),
	refundQuoteId: z.string().trim().optional().nullable(),
	reason: z.string().trim().min(1).default("guest_cancelled"),
	cancelledAt: z.coerce.date().optional(),
	paymentTransactionId: z.string().trim().optional().nullable(),
	externalReference: z.string().trim().optional().nullable(),
	idempotencyKey: z.string().trim().optional().nullable(),
})

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

async function readBody(request: Request): Promise<unknown> {
	const contentType = request.headers.get("content-type") ?? ""
	if (contentType.includes("application/json")) return request.json().catch(() => ({}))
	const form = await request.formData()
	return {
		bookingId: form.get("bookingId"),
		refundQuoteId: form.get("refundQuoteId") || undefined,
		reason: form.get("reason") || undefined,
		cancelledAt: form.get("cancelledAt") || undefined,
		paymentTransactionId: form.get("paymentTransactionId") || undefined,
		externalReference: form.get("externalReference") || undefined,
		idempotencyKey: form.get("idempotencyKey") || undefined,
	}
}

async function resolveQuote(params: {
	quoteId?: string | null
	context: Awaited<ReturnType<typeof loadRefundCancellationContext>>
	providerId: string
	reason: string
	cancelledAt: Date
	idempotencyKey?: string | null
	createdBy: string
}): Promise<{ quote: RefundQuote; quoteCreated: boolean }> {
	if (!params.context) throw new Error("booking_not_found")
	const quoteId = String(params.quoteId ?? "").trim()
	if (quoteId) {
		const quote = await refundCalculationRepository.findQuoteById(quoteId)
		if (
			!quote ||
			quote.providerId !== params.providerId ||
			quote.bookingId !== params.context.booking.id
		) {
			throw new Error("REFUND_QUOTE_NOT_FOUND")
		}
		return { quote, quoteCreated: false }
	}
	const saved = await createRefundQuoteBeforeCancellation(
		{ repo: refundCalculationRepository },
		{
			bookingId: params.context.booking.id,
			providerId: params.providerId,
			reason: params.reason,
			currency: params.context.booking.currency,
			grossAmount: params.context.booking.grossAmount,
			cancelledAt: params.cancelledAt,
			bookedAt: params.context.booking.bookedAt,
			policySnapshot: params.context.policySnapshot,
			lines: params.context.lines,
			idempotencyKey:
				params.idempotencyKey ||
				`refund_quote:${params.providerId}:${params.context.booking.id}:${params.reason}`,
			createdBy: params.createdBy,
			expiresAt: new Date(params.cancelledAt.getTime() + 15 * 60 * 1000),
		}
	)
	return { quote: saved.quote, quoteCreated: saved.created }
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const auth = await requireProvider(request)
		const parsed = schema.parse(await readBody(request))
		const cancelledAt = parsed.cancelledAt ?? new Date()
		const context = await loadRefundCancellationContext({
			bookingId: parsed.bookingId,
			providerId: auth.providerId,
		})
		if (!context) return json({ error: "booking_not_found" }, 404)
		if (!context.policySnapshot.cancellation) {
			return json({ error: "missing_cancellation_policy_snapshot" }, 409)
		}
		const { quote, quoteCreated } = await resolveQuote({
			quoteId: parsed.refundQuoteId,
			context,
			providerId: auth.providerId,
			reason: parsed.reason,
			cancelledAt,
			idempotencyKey: parsed.idempotencyKey,
			createdBy: auth.user.id,
		})
		if (quote.status !== "quoted") {
			return json({ error: "refund_quote_requires_manual_review", quote }, 409)
		}
		const ledger = await recordRefundLedgerFromQuote(
			{ repo: refundCalculationRepository },
			{
				refundQuoteId: quote.id,
				appliedAt: cancelledAt,
				appliedBy: auth.user.id,
				paymentTransactionId: parsed.paymentTransactionId ?? null,
				externalReference: parsed.externalReference ?? null,
			}
		)
		const financialPreview = buildPolicyFinancialPreviewFromSnapshot({
			providerId: auth.providerId,
			bookingId: context.booking.id,
			snapshot: context.policySnapshot,
			currency: context.booking.currency,
			grossAmount: context.booking.grossAmount,
			cancelledAt,
			bookedAt: context.booking.bookedAt,
			reason: parsed.reason,
			lines: context.lines,
			idPrefix: `cancel-preview:${auth.providerId}:${context.booking.id}`,
		})

		await db
			.update(Booking)
			.set({
				status: "cancelled",
				lifecycleAuditJson: {
					mode: "persisted_operation",
					cancelledAt: cancelledAt.toISOString(),
					previousStatus: context.booking.status,
					refundQuoteId: quote.id,
					refundLedgerId: ledger.id,
				},
				refundHandoffSnapshotJson: {
					state: "ledger_recorded",
					owner: "Finance",
					boundary: "refund_ledger",
					refundQuoteId: quote.id,
					refundLedgerId: ledger.id,
					refundAmount: ledger.refundAmount,
					currency: ledger.currency,
					financialPreview: financialPreview.preview,
				},
			} as any)
			.where(eq(Booking.id, context.booking.id))
		await invalidateBooking(context.booking.id, auth.providerId)
		void invalidateFinancialProviderSummary({
			providerId: auth.providerId,
			reason: "refund_ledger_recorded",
		})

		return json({
			bookingId: context.booking.id,
			status: "cancelled",
			quote,
			quoteCreated,
			ledger,
			financialPreview,
		})
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof z.ZodError)
			return json({ error: "validation_error", issues: error.issues }, 400)
		const message = error instanceof Error ? error.message : "internal_error"
		if (message === "REFUND_QUOTE_NOT_FOUND") return json({ error: message }, 404)
		return json({ error: message }, 500)
	}
}
