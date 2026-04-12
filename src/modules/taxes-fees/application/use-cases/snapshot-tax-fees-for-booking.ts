import type { BookingTaxFeeRepositoryPort } from "../ports/BookingTaxFeeRepositoryPort"
import type { TaxFeeBreakdown, TaxFeeLine } from "../../domain/tax-fee.types"

export async function snapshotTaxFeesForBooking(
	deps: { repo: BookingTaxFeeRepositoryPort },
	params: { bookingId: string; breakdown: TaxFeeBreakdown }
): Promise<void> {
	const bookingId = String(params.bookingId || "").trim()
	if (!bookingId) throw new Error("bookingId is required")

	const lines: TaxFeeLine[] = [
		...params.breakdown.taxes.included,
		...params.breakdown.taxes.excluded,
		...params.breakdown.fees.included,
		...params.breakdown.fees.excluded,
	]

	const now = new Date()
	const breakdownJson = params.breakdown
	const totalAmount = params.breakdown.total

	const rows =
		lines.length > 0
			? lines.map((line) => ({
					id: crypto.randomUUID(),
					bookingId,
					lineJson: line,
					breakdownJson,
					totalAmount,
					createdAt: now,
				}))
			: [
					{
						id: crypto.randomUUID(),
						bookingId,
						lineJson: null,
						breakdownJson,
						totalAmount,
						createdAt: now,
					},
				]

	await deps.repo.insertMany(rows)
}
