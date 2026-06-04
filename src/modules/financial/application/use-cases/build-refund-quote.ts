import type { HoldPolicySnapshot } from "@/modules/policies/public"
import type { RefundQuote, RefundQuoteLine } from "../../domain/refund-quote"

export type RefundQuoteMoneyLine = {
	type: "base" | "tax" | "fee" | "adjustment"
	label: string
	amount: number
	refundable?: boolean | null
	basis?: string | null
}

export type BuildRefundQuoteInput = {
	bookingId: string
	providerId: string
	reason: string
	currency: string
	grossAmount: number
	cancelledAt: Date
	bookedAt?: Date | null
	policySnapshot: HoldPolicySnapshot
	lines?: RefundQuoteMoneyLine[]
	id?: string
	idempotencyKey?: string
	createdBy?: string | null
	expiresAt?: Date | null
}

function clampPercent(value: unknown): number | null {
	if (value == null || value === "") return null
	const n = Number(value)
	if (!Number.isFinite(n)) return null
	return Math.max(0, Math.min(100, n))
}

function roundMoney(value: number): number {
	return Math.round((Number(value) || 0) * 100) / 100
}

function deadlineTime(value: string | null): number {
	if (!value) return Number.NEGATIVE_INFINITY
	const isoish = value.replace(/\[[^\]]+\]$/, "Z")
	const time = new Date(isoish).getTime()
	return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}

function dateOnlyTime(value: string | null | undefined): number | null {
	if (!value) return null
	const time = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`).getTime()
	return Number.isFinite(time) ? time : null
}

function selectCancellationTier(
	policySnapshot: HoldPolicySnapshot,
	cancelledAt: Date
):
	| NonNullable<
			NonNullable<NonNullable<HoldPolicySnapshot["cancellation"]>["calculation"]>["cancellation"]
	  >["refundTiers"][number]
	| null {
	const tiers = policySnapshot.cancellation?.calculation?.cancellation?.refundTiers ?? []
	if (!tiers.length) return null
	const cancelledTime = cancelledAt.getTime()
	return (
		[...tiers]
			.sort((a, b) => deadlineTime(b.deadlineLocal) - deadlineTime(a.deadlineLocal))
			.find((tier) => cancelledTime <= deadlineTime(tier.deadlineLocal)) ??
		tiers[tiers.length - 1] ??
		null
	)
}

function defaultLines(input: BuildRefundQuoteInput): RefundQuoteMoneyLine[] {
	if (input.lines?.length) return input.lines
	return [
		{
			type: "base",
			label: "Booking amount",
			amount: input.grossAmount,
			refundable: true,
			basis: "gross_amount",
		},
	]
}

function daysBeforeArrival(policySnapshot: HoldPolicySnapshot, cancelledAt: Date): number | null {
	const checkInTime = dateOnlyTime(policySnapshot.meta?.checkIn)
	if (checkInTime == null) return null
	return Math.ceil((checkInTime - cancelledAt.getTime()) / 86_400_000)
}

function isWithinGracePeriod(input: BuildRefundQuoteInput): boolean {
	const cancellation = input.policySnapshot.cancellation?.calculation?.cancellation
	const grace = cancellation?.gracePeriod
	const hours = Number(grace?.hoursAfterBooking ?? 0)
	if (!hours || hours <= 0 || !input.bookedAt) return false
	const elapsedHours = (input.cancelledAt.getTime() - input.bookedAt.getTime()) / 3_600_000
	if (elapsedHours < 0 || elapsedHours > hours) return false
	const requiredDays = grace?.requiresDaysBeforeArrival
	if (requiredDays == null) return true
	const days = daysBeforeArrival(input.policySnapshot, input.cancelledAt)
	return days == null ? false : days >= requiredDays
}

function moneyFromAmountOrPercent(params: {
	amount?: unknown
	percent?: unknown
	grossAmount: number
}): number {
	const amount = Number(params.amount ?? NaN)
	if (Number.isFinite(amount)) return roundMoney(Math.max(0, amount))
	const percent = clampPercent(params.percent)
	if (percent == null) return 0
	return roundMoney((params.grossAmount * percent) / 100)
}

export function buildRefundQuote(input: BuildRefundQuoteInput): RefundQuote {
	const bookingId = String(input.bookingId ?? "").trim()
	const providerId = String(input.providerId ?? "").trim()
	const currency = String(input.currency ?? "")
		.trim()
		.toUpperCase()
	if (!bookingId) throw new Error("bookingId is required")
	if (!providerId) throw new Error("providerId is required")
	if (!currency) throw new Error("currency is required")

	const tier = selectCancellationTier(input.policySnapshot, input.cancelledAt)
	const graceApplies = isWithinGracePeriod(input)
	const refundPercent = graceApplies ? 100 : clampPercent(tier?.refundPercent)
	const effectiveRefundPercent = refundPercent ?? 0
	const taxesFeesBasis =
		tier?.taxesFeesBasis ??
		input.policySnapshot.cancellation?.calculation?.cancellation?.taxesFeesBasis ??
		"manual_review"
	const payoutImpact =
		tier?.payoutImpact ?? input.policySnapshot.cancellation?.calculation?.cancellation?.payoutImpact
	const appliedOverride = input.policySnapshot.cancellation?.appliedOverrides?.[0] ?? null
	const lines: RefundQuoteLine[] = defaultLines(input).map((line) => {
		const refundable =
			line.refundable !== false &&
			(line.type === "base" ||
				taxesFeesBasis === "refund_basis" ||
				taxesFeesBasis === "pro_rated" ||
				line.type === "adjustment")
		const lineRefundPercent = refundable ? effectiveRefundPercent : 0
		return {
			type: line.type,
			label: line.label,
			basis: line.basis == null ? taxesFeesBasis : String(line.basis),
			amount: roundMoney(line.amount),
			refundPercent: lineRefundPercent,
			refundAmount: roundMoney((roundMoney(line.amount) * lineRefundPercent) / 100),
			currency,
		}
	})
	const refundAmount = roundMoney(lines.reduce((sum, line) => sum + line.refundAmount, 0))
	const grossAmount = roundMoney(input.grossAmount)
	const payoutPercent = clampPercent(payoutImpact?.hostPayoutPercent)
	const hostPayoutAmount =
		payoutPercent == null ? null : roundMoney((grossAmount * Math.max(0, payoutPercent)) / 100)
	const payoutImpactAmount =
		payoutPercent == null ? 0 : roundMoney((grossAmount * Math.max(0, 100 - payoutPercent)) / 100)
	const hostCancellationFeeAmount =
		appliedOverride?.type === "host_cancellation"
			? moneyFromAmountOrPercent({
					amount: appliedOverride.action.hostCancellationFeeAmount,
					percent: appliedOverride.action.hostCancellationFeePercent,
					grossAmount,
				})
			: 0
	const rebookingCreditAmount =
		appliedOverride?.type === "rebooking_refund"
			? moneyFromAmountOrPercent({
					amount: appliedOverride.action.rebookingCreditAmount,
					percent: appliedOverride.action.rebookingCreditPercent,
					grossAmount,
				})
			: 0
	const cancellation = input.policySnapshot.cancellation
	const payment = input.policySnapshot.payment
	const status = refundPercent == null ? "requires_manual_review" : "quoted"

	return {
		id: input.id ?? crypto.randomUUID(),
		bookingId,
		providerId,
		status,
		reason: String(input.reason ?? "booking_cancellation"),
		currency,
		grossAmount,
		refundAmount,
		nonRefundableAmount: roundMoney(Math.max(0, grossAmount - refundAmount)),
		taxFeeRefundAmount: roundMoney(
			lines
				.filter((line) => line.type === "tax" || line.type === "fee")
				.reduce((sum, line) => sum + line.refundAmount, 0)
		),
		payoutImpactAmount,
		paymentDueLocal: payment?.calculation?.payment?.paymentDueLocal ?? null,
		cancellationDeadlineLocal: tier?.deadlineLocal ?? null,
		refundPercent,
		policySnapshot: {
			sourcePolicyId: cancellation?.source?.policyId ?? cancellation?.policyId ?? null,
			sourcePolicyVersion: cancellation?.source?.version ?? cancellation?.version ?? null,
			sourcePolicyPresetKey: cancellation?.source?.policyPresetKey ?? null,
			deadlineLocal: graceApplies ? "grace_period" : (tier?.deadlineLocal ?? null),
			refundBasis: tier?.refundBasis ?? null,
			taxesFeesBasis,
			payoutBasis: payoutImpact?.payoutBasis ?? null,
			hostPayoutPercent: payoutPercent,
			hostPayoutAmount,
			hostCancellationFeeAmount,
			rebookingCreditAmount,
			appliedOverrideIds: cancellation?.appliedOverrides?.map((override) => override.id) ?? [],
		},
		lines,
		calculationSnapshotJson: {
			selectedCancellationTier: tier,
			gracePeriod: {
				applied: graceApplies,
				bookedAt: input.bookedAt?.toISOString() ?? null,
				cancelledAt: input.cancelledAt.toISOString(),
			},
			hostPayout: {
				hostPayoutPercent: payoutPercent,
				hostPayoutAmount,
				payoutImpactAmount,
			},
			hostCancellationFeeAmount,
			rebookingCreditAmount,
			cancellationCalculation: cancellation?.calculation ?? null,
			paymentCalculation: payment?.calculation ?? null,
			noShowCalculation: input.policySnapshot.no_show?.calculation ?? null,
		},
		idempotencyKey:
			input.idempotencyKey ?? `refund_quote:${bookingId}:${input.cancelledAt.toISOString()}`,
		quotedAt: input.cancelledAt,
		expiresAt: input.expiresAt ?? null,
		createdBy: input.createdBy ?? null,
	}
}
