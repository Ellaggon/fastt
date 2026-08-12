import { isPriceQuote, type PriceQuote } from "@/modules/pricing/public"

type FiscalReportBooking = {
	bookingId: string
	status: string
	currency: string | null
	confirmedAt: Date | null
	totalAmount: unknown
	pricingBreakdownJson: unknown
}

type FiscalReportTaxSnapshot = {
	bookingId: string
	totalAmount: unknown
}

type FiscalReportRefund = {
	bookingId: string
	refundAmount: unknown
	status: string
}

export type FiscalReportRow = {
	bookingId: string
	confirmedAt: string | null
	status: string
	currency: string
	quoteId: string | null
	baseAmount: number
	taxAmount: number
	feeAmount: number
	guestTotal: number
	providerCollectedAmount: number
	platformCollectedAmount: number
	marketplaceCollectedAmount: number
	refundedAmount: number
	reconciliationStatus: "reconciled" | "needs_review" | "legacy_snapshot"
	mismatchReasons: string[]
}

export type FiscalReport = {
	rows: FiscalReportRow[]
	summary: {
		bookings: number
		currencies: string[]
		guestTotal: number
		taxAmount: number
		feeAmount: number
		refundedAmount: number
		needsReview: number
		missingSnapshots: number
	}
}

function money(value: unknown) {
	const parsed = Number(value ?? 0)
	return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0
}

function quoteFromSnapshot(value: unknown): PriceQuote | null {
	const candidate =
		value && typeof value === "object" ? (value as { priceQuote?: unknown }).priceQuote : null
	return isPriceQuote(candidate) ? candidate : null
}

function fiscalLines(quote: PriceQuote) {
	return [
		...quote.taxesAndFees.taxes.included,
		...quote.taxesAndFees.taxes.excluded,
		...quote.taxesAndFees.fees.included,
		...quote.taxesAndFees.fees.excluded,
	]
}

/**
 * Builds an exportable report from booking snapshots. It deliberately never
 * evaluates the provider's current rules against historical reservations.
 */
export function buildFiscalReport(input: {
	bookings: FiscalReportBooking[]
	taxSnapshots: FiscalReportTaxSnapshot[]
	refunds: FiscalReportRefund[]
}): FiscalReport {
	const taxByBooking = new Map<string, number>()
	for (const item of input.taxSnapshots) {
		taxByBooking.set(
			item.bookingId,
			money(taxByBooking.get(item.bookingId)) + money(item.totalAmount)
		)
	}
	const refundsByBooking = new Map<string, number>()
	for (const item of input.refunds) {
		if (!["recorded", "applied"].includes(String(item.status))) continue
		refundsByBooking.set(
			item.bookingId,
			money(refundsByBooking.get(item.bookingId)) + money(item.refundAmount)
		)
	}

	const rows = input.bookings.map((booking) => {
		const quote = quoteFromSnapshot(booking.pricingBreakdownJson)
		const snapshotTotal = money(taxByBooking.get(booking.bookingId))
		const mismatchReasons: string[] = []
		if (!quote && !snapshotTotal) mismatchReasons.push("missing_fiscal_snapshot")
		if (quote && Math.abs(money(booking.totalAmount) - quote.totalAmount) > 0.01) {
			mismatchReasons.push("booking_total_differs_from_quote")
		}
		const lines = quote ? fiscalLines(quote) : []
		const taxAmount = quote
			? money(
					[...quote.taxesAndFees.taxes.included, ...quote.taxesAndFees.taxes.excluded].reduce(
						(sum, line) => sum + money(line.amount),
						0
					)
				)
			: snapshotTotal
		const feeAmount = quote
			? money(
					[...quote.taxesAndFees.fees.included, ...quote.taxesAndFees.fees.excluded].reduce(
						(sum, line) => sum + money(line.amount),
						0
					)
				)
			: 0
		const responsibility = (owner: string) =>
			money(
				lines
					.filter((line) => line.collectionResponsibility === owner)
					.reduce((sum, line) => sum + money(line.amount), 0)
			)
		const reconciliationStatus: FiscalReportRow["reconciliationStatus"] =
			!quote && snapshotTotal
				? "legacy_snapshot"
				: mismatchReasons.length
					? "needs_review"
					: "reconciled"

		return {
			bookingId: booking.bookingId,
			confirmedAt: booking.confirmedAt?.toISOString() ?? null,
			status: booking.status,
			currency: quote?.currency ?? String(booking.currency ?? "USD").toUpperCase(),
			quoteId: quote?.quoteId ?? null,
			baseAmount: quote?.baseAmount ?? money(booking.totalAmount) - snapshotTotal,
			taxAmount,
			feeAmount,
			guestTotal: quote?.totalAmount ?? money(booking.totalAmount),
			providerCollectedAmount: responsibility("provider"),
			platformCollectedAmount: responsibility("platform"),
			marketplaceCollectedAmount: responsibility("marketplace"),
			refundedAmount: money(refundsByBooking.get(booking.bookingId)),
			reconciliationStatus,
			mismatchReasons,
		}
	})

	return {
		rows,
		summary: {
			bookings: rows.length,
			currencies: [...new Set(rows.map((row) => row.currency))].sort(),
			guestTotal: money(rows.reduce((sum, row) => sum + row.guestTotal, 0)),
			taxAmount: money(rows.reduce((sum, row) => sum + row.taxAmount, 0)),
			feeAmount: money(rows.reduce((sum, row) => sum + row.feeAmount, 0)),
			refundedAmount: money(rows.reduce((sum, row) => sum + row.refundedAmount, 0)),
			needsReview: rows.filter((row) => row.reconciliationStatus === "needs_review").length,
			missingSnapshots: rows.filter((row) =>
				row.mismatchReasons.includes("missing_fiscal_snapshot")
			).length,
		},
	}
}

export function fiscalReportCsv(report: FiscalReport) {
	const columns: Array<keyof FiscalReportRow> = [
		"bookingId",
		"confirmedAt",
		"status",
		"currency",
		"quoteId",
		"baseAmount",
		"taxAmount",
		"feeAmount",
		"guestTotal",
		"providerCollectedAmount",
		"platformCollectedAmount",
		"marketplaceCollectedAmount",
		"refundedAmount",
		"reconciliationStatus",
		"mismatchReasons",
	]
	const escape = (value: unknown) =>
		`"${String(Array.isArray(value) ? value.join("|") : (value ?? "")).replaceAll('"', '""')}"`
	return [
		columns.join(","),
		...report.rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
	].join("\n")
}
