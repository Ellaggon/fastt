import { randomUUID } from "node:crypto"
import type { TourTrustRepositoryPort } from "../ports/TourTrustRepositoryPort"

export type CreateVerifiedReviewInput = {
	userId: string
	bookingId: string
	rating: number
	body?: string | null
}

export type CreateVerifiedReviewResult =
	| { ok: true; reviewId: string; status: string; idempotent?: boolean }
	| {
			ok: false
			error:
				| "unauthorized"
				| "booking_not_found"
				| "not_eligible"
				| "already_reviewed"
				| "validation_error"
	  }

/**
 * Post-activity review: only the booking owner, after real attendance
 * (voucher redeemed OR checkedInAt), for a confirmed/finalized tour booking.
 */
export async function createVerifiedProductReview(
	deps: { repo: TourTrustRepositoryPort },
	input: CreateVerifiedReviewInput
): Promise<CreateVerifiedReviewResult> {
	const userId = String(input.userId ?? "").trim()
	const bookingId = String(input.bookingId ?? "").trim()
	const rating = Math.round(Number(input.rating))
	const body = String(input.body ?? "").trim() || null

	if (!userId || !bookingId) return { ok: false, error: "unauthorized" }
	if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
		return { ok: false, error: "validation_error" }
	}

	const booking = await deps.repo.findOwnedBooking({ bookingId, userId })
	if (!booking) return { ok: false, error: "booking_not_found" }

	const status = String(booking.status ?? "").toLowerCase()
	const ops = String(booking.operationalStatus ?? "").toLowerCase()
	const finalized =
		status === "confirmed" ||
		ops === "checked_in" ||
		ops === "checked_out" ||
		Boolean(booking.checkedInAt)
	if (!finalized || status === "cancelled" || status === "draft") {
		return { ok: false, error: "not_eligible" }
	}

	const voucherStatus = await deps.repo.findVoucherStatus(bookingId)
	const attended =
		Boolean(booking.checkedInAt) || String(voucherStatus ?? "").toLowerCase() === "redeemed"
	if (!attended) return { ok: false, error: "not_eligible" }

	const line = await deps.repo.findTourLineForBooking(bookingId)
	const productId = String(line?.productIdSnapshot ?? line?.productId ?? "").trim()
	const productType = String(line?.productType ?? "")
		.trim()
		.toLowerCase()
	if (!productId || productType !== "tour") return { ok: false, error: "not_eligible" }

	const existing = await deps.repo.findReviewByBookingId(bookingId)
	if (existing) {
		return {
			ok: true,
			reviewId: String(existing.id),
			status: String(existing.status ?? "pending"),
			idempotent: true,
		}
	}

	const reviewId = randomUUID()
	try {
		await deps.repo.insertProductReview({
			id: reviewId,
			productId,
			userId,
			bookingId,
			rating,
			body,
			status: "pending",
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (message.toLowerCase().includes("unique") || message.includes("ProductReview_bookingId")) {
			const again = await deps.repo.findReviewByBookingId(bookingId)
			if (again) {
				return { ok: true, reviewId: String(again.id), status: "pending", idempotent: true }
			}
			return { ok: false, error: "already_reviewed" }
		}
		throw error
	}

	return { ok: true, reviewId, status: "pending" }
}
