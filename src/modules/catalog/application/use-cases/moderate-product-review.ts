import type { TourTrustRepositoryPort } from "../ports/TourTrustRepositoryPort"

export type ModerateProductReviewInput = {
	providerId: string
	reviewId: string
	status: "published" | "rejected" | "hidden"
}

export type ModerateProductReviewResult =
	| {
			ok: true
			reviewId: string
			status: "published" | "rejected" | "hidden"
			idempotent: boolean
	  }
	| {
			ok: false
			error: "unauthorized" | "not_found" | "validation_error"
	  }

/**
 * Provider moderation closes the review transition (pending → published|rejected|hidden).
 * Only the product owner provider may moderate. Idempotent on same target status.
 */
export async function moderateProductReview(
	deps: { repo: TourTrustRepositoryPort },
	input: ModerateProductReviewInput
): Promise<ModerateProductReviewResult> {
	const providerId = String(input.providerId ?? "").trim()
	const reviewId = String(input.reviewId ?? "").trim()
	const status = input.status

	if (!providerId || !reviewId) return { ok: false, error: "unauthorized" }
	if (status !== "published" && status !== "rejected" && status !== "hidden") {
		return { ok: false, error: "validation_error" }
	}

	const row = await deps.repo.findReviewWithProductProvider(reviewId)
	if (!row || String(row.providerId ?? "") !== providerId) {
		return { ok: false, error: "not_found" }
	}

	const current = String(row.status ?? "").toLowerCase()
	if (current === status) {
		return { ok: true, reviewId, status, idempotent: true }
	}

	await deps.repo.updateReviewStatus({ reviewId, status })
	return { ok: true, reviewId, status, idempotent: false }
}
