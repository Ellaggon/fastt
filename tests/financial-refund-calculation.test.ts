import { describe, expect, it } from "vitest"

import {
	buildRefundLedgerEntry,
	buildRefundQuote,
	createRefundQuoteBeforeCancellation,
	recordRefundLedgerFromQuote,
	type RefundCalculationRepositoryPort,
	type RefundLedger,
	type RefundQuote,
} from "@/modules/financial/public"
import type { HoldPolicySnapshot } from "@/modules/policies/public"

function policySnapshot(): HoldPolicySnapshot {
	return {
		cancellation: {
			category: "cancellation",
			policyId: "pol_cancel_v1",
			groupId: "grp_cancel",
			version: 3,
			description: "Moderate cancellation",
			resolvedFromScope: "rate_plan",
			source: {
				policyId: "pol_cancel_v1",
				groupId: "grp_cancel",
				version: 3,
				resolvedFromScope: "rate_plan",
				policyPresetKey: "moderate",
			},
			metadata: {
				policyPresetKey: "moderate",
				stayLengthType: "short_stay",
				gracePeriod: 24,
				refundBasis: "nightly_rate",
				payoutBasis: "host_payout",
				localTimezone: "America/Santiago",
				legalOverrideFlags: null,
			},
			calculation: {
				localTimezone: "America/Santiago",
				override: {
					applied: false,
					ruleId: null,
					type: null,
					reason: null,
					action: null,
				},
				cancellation: {
					refundTiers: [
						{
							daysBeforeArrival: 7,
							deadlineLocal: "2030-02-03T00:00:00[America/Santiago]",
							penaltyType: "percentage",
							penaltyAmount: 50,
							refundPercent: 50,
							refundBasis: "nightly_rate",
							taxesFeesBasis: "pro_rated",
							payoutImpact: {
								payoutBasis: "host_payout",
								hostPayoutPercent: 50,
								platformAbsorbsRefund: false,
							},
						},
					],
					freeCancellationDeadlineLocal: null,
					taxesFeesBasis: "pro_rated",
					payoutImpact: {
						payoutBasis: "host_payout",
						hostPayoutPercent: 50,
						platformAbsorbsRefund: false,
					},
					stayLength: {
						nights: 2,
						type: "short_stay",
						thresholdNights: 28,
						isLongStay: false,
					},
					gracePeriod: {
						hoursAfterBooking: 24,
						requiresDaysBeforeArrival: 2,
					},
				},
				payment: null,
				noShow: null,
			},
			appliedOverrides: [],
			rules: [],
			cancellationTiers: [],
		},
		payment: {
			category: "payment",
			policyId: "pol_payment_v1",
			groupId: "grp_payment",
			version: 1,
			description: "Prepay",
			resolvedFromScope: "rate_plan",
			calculation: {
				localTimezone: "America/Santiago",
				override: {
					applied: false,
					ruleId: null,
					type: null,
					reason: null,
					action: null,
				},
				cancellation: null,
				payment: {
					paymentType: "prepayment",
					paymentDueLocal: "2030-02-01T00:00:00[America/Santiago]",
					prepaymentPercentage: 100,
					payoutBasis: "host_payout",
				},
				noShow: null,
			},
			rules: [],
			cancellationTiers: [],
		},
		no_show: null,
		check_in: null,
		meta: {
			policyVersionIds: ["pol_cancel_v1", "pol_payment_v1"],
			resolvedAt: "2030-01-01T00:00:00.000Z",
			checkIn: "2030-02-10",
			checkOut: "2030-02-12",
			channel: "web",
		},
	}
}

describe("financial/refund calculation engine", () => {
	it("builds a calculable RefundQuote from policy snapshots without resolving policies", () => {
		const quote = buildRefundQuote({
			bookingId: "booking_1",
			providerId: "provider_1",
			reason: "guest_cancelled",
			currency: "bob",
			grossAmount: 1200,
			cancelledAt: new Date("2030-02-01T12:00:00.000Z"),
			policySnapshot: policySnapshot(),
			lines: [
				{ type: "base", label: "Nightly amount", amount: 1000, basis: "nightly_rate" },
				{ type: "tax", label: "VAT", amount: 100, basis: "tax_included" },
				{ type: "fee", label: "Cleaning fee", amount: 100, basis: "fee_excluded" },
			],
		})

		expect(quote.status).toBe("quoted")
		expect(quote.currency).toBe("BOB")
		expect(quote.refundAmount).toBe(600)
		expect(quote.taxFeeRefundAmount).toBe(100)
		expect(quote.nonRefundableAmount).toBe(600)
		expect(quote.payoutImpactAmount).toBe(600)
		expect(quote.paymentDueLocal).toBe("2030-02-01T00:00:00[America/Santiago]")
		expect(quote.policySnapshot).toEqual(
			expect.objectContaining({
				sourcePolicyId: "pol_cancel_v1",
				sourcePolicyVersion: 3,
				sourcePolicyPresetKey: "moderate",
				deadlineLocal: "2030-02-03T00:00:00[America/Santiago]",
				taxesFeesBasis: "pro_rated",
				payoutBasis: "host_payout",
				hostPayoutPercent: 50,
				hostPayoutAmount: 600,
				hostCancellationFeeAmount: 0,
				rebookingCreditAmount: 0,
			})
		)
	})

	it("applies the real post-booking grace period before the normal tier", () => {
		const quote = buildRefundQuote({
			bookingId: "booking_grace",
			providerId: "provider_1",
			reason: "guest_cancelled",
			currency: "USD",
			grossAmount: 1200,
			bookedAt: new Date("2030-01-31T10:00:00.000Z"),
			cancelledAt: new Date("2030-02-01T09:00:00.000Z"),
			policySnapshot: policySnapshot(),
		})

		expect(quote.refundPercent).toBe(100)
		expect(quote.refundAmount).toBe(1200)
		expect((quote.calculationSnapshotJson as any).gracePeriod).toEqual(
			expect.objectContaining({ applied: true })
		)
		expect(quote.policySnapshot.deadlineLocal).toBe("grace_period")
	})

	it("separates host cancellation fee and rebooking credit overrides", () => {
		const snapshot = policySnapshot()
		snapshot.cancellation!.appliedOverrides = [
			{
				id: "per_rebook",
				type: "rebooking_refund",
				reason: "Guest accepted rebooking credit",
				priority: 1,
				source: "PolicyExceptionRule",
				action: { rebookingCreditPercent: 20 },
			},
		]
		const rebookingQuote = buildRefundQuote({
			bookingId: "booking_rebooking",
			providerId: "provider_1",
			reason: "guest_cancelled",
			currency: "USD",
			grossAmount: 1000,
			cancelledAt: new Date("2030-02-01T12:00:00.000Z"),
			policySnapshot: snapshot,
		})
		expect(rebookingQuote.policySnapshot.rebookingCreditAmount).toBe(200)
		expect((rebookingQuote.calculationSnapshotJson as any).rebookingCreditAmount).toBe(200)

		snapshot.cancellation!.appliedOverrides = [
			{
				id: "per_host_cancel",
				type: "host_cancellation",
				reason: "Host cancelled",
				priority: 1,
				source: "PolicyExceptionRule",
				action: { hostCancellationFeeAmount: 75 },
			},
		]
		const hostCancelQuote = buildRefundQuote({
			bookingId: "booking_host_cancel",
			providerId: "provider_1",
			reason: "host_cancelled",
			currency: "USD",
			grossAmount: 1000,
			cancelledAt: new Date("2030-02-01T12:00:00.000Z"),
			policySnapshot: snapshot,
		})
		expect(hostCancelQuote.policySnapshot.hostCancellationFeeAmount).toBe(75)
		expect((hostCancelQuote.calculationSnapshotJson as any).hostCancellationFeeAmount).toBe(75)
	})

	it("records a RefundLedger entry from a quoted RefundQuote", () => {
		const quote = buildRefundQuote({
			bookingId: "booking_2",
			providerId: "provider_1",
			reason: "guest_cancelled",
			currency: "USD",
			grossAmount: 500,
			cancelledAt: new Date("2030-02-01T12:00:00.000Z"),
			policySnapshot: policySnapshot(),
		})
		const ledger = buildRefundLedgerEntry({
			quote,
			appliedAt: new Date("2030-02-01T13:00:00.000Z"),
			paymentTransactionId: "pt_refund_1",
			externalReference: "psp_ref_1",
			appliedBy: "ops_1",
		})

		expect(ledger).toEqual(
			expect.objectContaining({
				refundQuoteId: quote.id,
				bookingId: "booking_2",
				status: "recorded",
				refundAmount: quote.refundAmount,
				payoutImpactAmount: quote.payoutImpactAmount,
				paymentTransactionId: "pt_refund_1",
				externalReference: "psp_ref_1",
				basis: "refund_quote",
			})
		)
	})

	it("blocks ledger creation when the quote requires manual review", () => {
		const snapshot = policySnapshot()
		snapshot.cancellation!.calculation!.cancellation!.refundTiers[0]!.refundPercent = null
		const quote = buildRefundQuote({
			bookingId: "booking_3",
			providerId: "provider_1",
			reason: "guest_cancelled",
			currency: "USD",
			grossAmount: 500,
			cancelledAt: new Date("2030-02-01T12:00:00.000Z"),
			policySnapshot: snapshot,
		})

		expect(quote.status).toBe("requires_manual_review")
		expect(() =>
			buildRefundLedgerEntry({
				quote,
				appliedAt: new Date("2030-02-01T13:00:00.000Z"),
			})
		).toThrow("REFUND_QUOTE_NOT_RECORDABLE")
	})

	it("persists quote before cancellation and records ledger from the saved quote", async () => {
		const quotes = new Map<string, RefundQuote>()
		const ledgers: RefundLedger[] = []
		const repo: RefundCalculationRepositoryPort = {
			async saveQuoteIfAbsentByIdempotencyKey(quote) {
				const existing = [...quotes.values()].find(
					(row) => row.idempotencyKey === quote.idempotencyKey
				)
				if (existing) return { quote: existing, created: false }
				quotes.set(quote.id, quote)
				return { quote, created: true }
			},
			async findQuoteById(id) {
				return quotes.get(id) ?? null
			},
			async findQuotesByBookingId(bookingId) {
				return [...quotes.values()].filter((quote) => quote.bookingId === bookingId)
			},
			async findLedgerByQuoteId(refundQuoteId) {
				return ledgers.find((entry) => entry.refundQuoteId === refundQuoteId) ?? null
			},
			async recordLedgerEntry(entry) {
				const existing = ledgers.find((row) => row.refundQuoteId === entry.refundQuoteId)
				if (existing) return existing
				ledgers.push(entry)
				return entry
			},
			async findLedgerByBookingId(bookingId) {
				return ledgers.filter((entry) => entry.bookingId === bookingId)
			},
		}

		const saved = await createRefundQuoteBeforeCancellation(
			{ repo },
			{
				bookingId: "booking_4",
				providerId: "provider_1",
				reason: "guest_cancelled",
				currency: "USD",
				grossAmount: 500,
				cancelledAt: new Date("2030-02-01T12:00:00.000Z"),
				policySnapshot: policySnapshot(),
				idempotencyKey: "refund_quote:booking_4:cancel",
			}
		)
		const duplicate = await createRefundQuoteBeforeCancellation(
			{ repo },
			{
				bookingId: "booking_4",
				providerId: "provider_1",
				reason: "guest_cancelled",
				currency: "USD",
				grossAmount: 500,
				cancelledAt: new Date("2030-02-01T12:00:00.000Z"),
				policySnapshot: policySnapshot(),
				idempotencyKey: "refund_quote:booking_4:cancel",
			}
		)
		const ledger = await recordRefundLedgerFromQuote(
			{ repo },
			{
				refundQuoteId: saved.quote.id,
				appliedAt: new Date("2030-02-01T13:00:00.000Z"),
			}
		)

		expect(saved.created).toBe(true)
		expect(duplicate.created).toBe(false)
		expect(duplicate.quote.id).toBe(saved.quote.id)
		expect(ledger.refundQuoteId).toBe(saved.quote.id)
		expect(await repo.findLedgerByBookingId("booking_4")).toHaveLength(1)
	})

	it("rejects refund ledger recording when the quote was not persisted first", async () => {
		const repo: RefundCalculationRepositoryPort = {
			async saveQuoteIfAbsentByIdempotencyKey(quote) {
				return { quote, created: true }
			},
			async findQuoteById() {
				return null
			},
			async findQuotesByBookingId() {
				return []
			},
			async findLedgerByQuoteId() {
				return null
			},
			async recordLedgerEntry() {
				throw new Error("should not record without quote")
			},
			async findLedgerByBookingId() {
				return []
			},
		}

		await expect(
			recordRefundLedgerFromQuote(
				{ repo },
				{
					refundQuoteId: "missing_quote",
					appliedAt: new Date("2030-02-01T13:00:00.000Z"),
				}
			)
		).rejects.toThrow("REFUND_QUOTE_NOT_FOUND")
	})
})
