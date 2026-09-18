import { afterEach, describe, expect, it } from "vitest"
import {
	liveMoneyExecutionInfrastructure,
	liveMoneyMovementRelease,
} from "@/lib/payments/live-money-activation"
import { isStripePayoutRailLiveEnabled } from "@/lib/payout-rail/stripeConnect"

const keys = [
	"PAYOUT_RAIL_LIVE",
	"FASTT_LIVE_MONEY_APPROVAL_REFERENCE",
	"FASTT_ENABLE_LIVE_MONEY_MOVEMENT",
] as const
const previous = new Map<string, string | undefined>()

function reset() {
	for (const key of keys) {
		const value = previous.get(key)
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
}

describe("live money activation", () => {
	for (const key of keys) previous.set(key, process.env[key])
	afterEach(reset)

	it("does not treat a provider choice or a technical flag as approval", () => {
		process.env.PAYOUT_RAIL_LIVE = "1"
		process.env.FASTT_ENABLE_LIVE_MONEY_MOVEMENT = "1"
		expect(isStripePayoutRailLiveEnabled()).toBe(false)
		expect(liveMoneyMovementRelease().enabled).toBe(false)
	})

	it("requires an explicit approved reference for live verification and money release", () => {
		process.env.PAYOUT_RAIL_LIVE = "1"
		process.env.FASTT_ENABLE_LIVE_MONEY_MOVEMENT = "1"
		process.env.FASTT_LIVE_MONEY_APPROVAL_REFERENCE = "FIN-LEGAL-2026-01"
		expect(isStripePayoutRailLiveEnabled()).toBe(true)
		expect(liveMoneyMovementRelease()).toEqual({
			enabled: true,
			approvalReference: "FIN-LEGAL-2026-01",
		})
	})

	it("keeps capture and settlement unavailable until their own adapters exist", () => {
		expect(liveMoneyExecutionInfrastructure("collect_payment")).toEqual({
			available: false,
			reason: "No hay un procesador de cobro al viajero habilitado.",
		})
		expect(liveMoneyExecutionInfrastructure("payout")).toEqual({
			available: false,
			reason: "No hay un ejecutor de liquidaciones a proveedores habilitado.",
		})
	})
})
