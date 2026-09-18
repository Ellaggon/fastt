import { describe, expect, it } from "vitest"
import { buildTourPaymentTerms, isSupportedTourPaymentType } from "@/lib/tours/tour-payment-terms"

describe("tour payment terms", () => {
	it("exposes only the provider-at-experience contract", () => {
		expect(isSupportedTourPaymentType("pay_at_property")).toBe(true)
		expect(isSupportedTourPaymentType("prepayment")).toBe(false)
		expect(
			buildTourPaymentTerms({
				payment: {
					calculation: { payment: { paymentType: "pay_at_property" } },
				} as any,
			})
		).toMatchObject({
			status: "provider_at_experience",
			recipient: "El proveedor del tour",
			timing: "Paga al proveedor al realizar el tour",
		})
	})

	it("does not promise payment when a prepayment policy is resolved", () => {
		expect(
			buildTourPaymentTerms({
				payment: { calculation: { payment: { paymentType: "prepayment" } } } as any,
			})
		).toMatchObject({ status: "unavailable" })
	})
})
