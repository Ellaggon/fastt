/** A source's updatedAt is not proof that a human reviewed it. */
export function parseReviewDate(metadata: unknown): Date | null {
	const value = (metadata as { lastReview?: { reviewedAt?: unknown } } | null)?.lastReview
		?.reviewedAt
	if (typeof value !== "string") return null
	const date = new Date(value)
	return Number.isFinite(date.getTime()) ? date : null
}
