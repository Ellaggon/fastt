import type { APIRoute } from "astro"
import { z } from "zod"

import { requireProvider } from "@/lib/auth/requireProvider"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { loadRefundCancellationContext } from "@/lib/financial/refundCancellationContext"
import { refundCalculationRepository } from "@/container/financial.container"
import { createRefundQuoteBeforeCancellation } from "@/modules/financial/public"

const schema = z.object({
	bookingId: z.string().trim().min(1),
	reason: z.string().trim().min(1).default("guest_cancelled"),
	cancelledAt: z.coerce.date().optional(),
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
		reason: form.get("reason") || undefined,
		cancelledAt: form.get("cancelledAt") || undefined,
		idempotencyKey: form.get("idempotencyKey") || undefined,
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const auth = await requireProvider(request)
		void getProviderIdFromRequest
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

		const saved = await createRefundQuoteBeforeCancellation(
			{ repo: refundCalculationRepository },
			{
				bookingId: context.booking.id,
				providerId: auth.providerId,
				reason: parsed.reason,
				currency: context.booking.currency,
				grossAmount: context.booking.grossAmount,
				cancelledAt,
				bookedAt: context.booking.bookedAt,
				policySnapshot: context.policySnapshot,
				lines: context.lines,
				idempotencyKey:
					parsed.idempotencyKey ||
					`refund_quote:${auth.providerId}:${context.booking.id}:${parsed.reason}`,
				createdBy: auth.user.id,
				expiresAt: new Date(cancelledAt.getTime() + 15 * 60 * 1000),
			}
		)
		return json({ quote: saved.quote, created: saved.created }, saved.created ? 201 : 200)
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof z.ZodError)
			return json({ error: "validation_error", issues: error.issues }, 400)
		return json({ error: error instanceof Error ? error.message : "internal_error" }, 500)
	}
}
