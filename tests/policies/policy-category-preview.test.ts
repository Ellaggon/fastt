import { describe, expect, it } from "vitest"
import { buildPolicyCategoryPreview } from "@/lib/policies/buildPolicyCategoryPreview"

function quote(overrides: Record<string, unknown> = {}) {
	return {
		currency: "BOB",
		refundAmount: 800,
		refundPercent: 80,
		nonRefundableAmount: 200,
		taxFeeRefundAmount: 100,
		policySnapshot: { hostPayoutAmount: 200 },
		...overrides,
	}
}

function financialPreview() {
	return {
		snapshot: {
			cancellation: {
				rules: [],
				calculation: {
					cancellation: {
						freeCancellationDeadlineLocal: "2026-07-10T00:00[property_local]",
						refundTiers: [{ refundPercent: 100 }],
					},
				},
			},
			payment: {
				rules: [
					{ ruleKey: "paymentType", ruleValue: "prepayment" },
					{ ruleKey: "prepaymentPercentage", ruleValue: 50 },
				],
				calculation: {
					payment: {
						paymentType: "prepayment",
						prepaymentPercentage: 50,
						paymentDueLocal: "2026-07-15T00:00[property_local]",
					},
				},
			},
			no_show: {
				rules: [{ ruleKey: "penaltyType", ruleValue: "first_night" }],
				calculation: {
					noShow: {
						chargeType: "first_night",
						chargeAmount: null,
						chargeBasis: "first_night",
						payoutImpact: { hostPayoutPercent: 100 },
					},
				},
			},
			check_in: {
				rules: [
					{ ruleKey: "checkInFrom", ruleValue: "15:00" },
					{ ruleKey: "checkInUntil", ruleValue: "22:00" },
					{ ruleKey: "checkOutUntil", ruleValue: "11:00" },
				],
			},
			meta: {},
		},
		longStaySnapshot: {
			cancellation: {
				calculation: { cancellation: { stayLength: { isLongStay: true } } },
			},
		},
		quotes: {
			cancelToday: quote(),
			cancelSevenDaysBefore: quote({ refundAmount: 1000, refundPercent: 100 }),
			longStay: quote({ refundAmount: 500, refundPercent: 50 }),
		},
		preview: [],
	} as any
}

describe("policy category preview", () => {
	it("muestra solo consecuencias de cancelación", () => {
		const result = buildPolicyCategoryPreview({
			category: "Cancellation",
			financialPreview: financialPreview(),
		})

		expect(result.previewReady).toBe(true)
		expect(result.title).toBe("Vista previa de cancelación")
		expect(result.items.map((item) => item.key)).toEqual([
			"free_cancellation",
			"cancel_7_days",
			"cancel_today",
			"long_stay",
			"financial_impact",
		])
		expect(result.items.map((item) => item.key)).not.toContain("payment_due")
	})

	it("muestra cobro y garantía para pago", () => {
		const result = buildPolicyCategoryPreview({
			category: "Payment",
			financialPreview: financialPreview(),
		})

		expect(result.previewReady).toBe(true)
		expect(result.items.map((item) => item.key)).toEqual([
			"payment_timing",
			"payment_amount",
			"payment_due",
			"payment_guarantee",
		])
		expect(result.items[1].value).toBe("50% de la reserva")
	})

	it("muestra cargo e impacto para no presentación", () => {
		const result = buildPolicyCategoryPreview({
			category: "NoShow",
			financialPreview: financialPreview(),
		})

		expect(result.previewReady).toBe(true)
		expect(result.items.map((item) => item.key)).toEqual([
			"no_show_charge",
			"no_show_basis",
			"no_show_payout",
		])
		expect(result.items[0].value).toBe("Primera noche")
	})

	it("muestra horarios operativos para llegada y salida", () => {
		const result = buildPolicyCategoryPreview({
			category: "CheckIn",
			financialPreview: financialPreview(),
		})

		expect(result.previewReady).toBe(true)
		expect(result.items.map((item) => item.key)).toEqual([
			"check_in",
			"check_out",
			"arrival_local_time",
		])
		expect(result.items[0].value).toBe("15:00–22:00")
		expect(result.items[1].value).toBe("Hasta 11:00")
	})
})
