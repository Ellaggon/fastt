import { describe, expect, it } from "vitest"
import { buildProviderReviewWaitState } from "@/lib/provider-review-wait-state"
import { canVerifyBankAccountAutomatically, getPayoutRailStatus } from "@/lib/payout-rail"
describe("available banking controls", () => {
	it("keeps pending review messaging independent of microdeposits", () => {
		expect(buildProviderReviewWaitState("payment").body).toContain("revisión")
		expect(buildProviderReviewWaitState("payment").body).not.toContain("depósitos")
	})
	it("never offers automatic verification in a simulated environment", () => {
		const status = { ...getPayoutRailStatus(), mode: "simulated" as const }
		expect(canVerifyBankAccountAutomatically({ country: "US", currency: "USD" }, status)).toBe(
			false
		)
	})
	it("does not offer ACH for unsupported countries or currencies", () => {
		const status = { ...getPayoutRailStatus(), mode: "live" as const }
		expect(canVerifyBankAccountAutomatically({ country: "BO", currency: "USD" }, status)).toBe(
			false
		)
		expect(canVerifyBankAccountAutomatically({ country: "US", currency: "EUR" }, status)).toBe(
			false
		)
		expect(
			canVerifyBankAccountAutomatically(
				{ country: "US", currency: "USD", method: "international_wire" },
				status
			)
		).toBe(false)
	})
})
