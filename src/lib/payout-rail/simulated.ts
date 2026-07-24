import { randomInt } from "node:crypto"

import type {
	InitiatePayoutRailMicroDepositInput,
	InitiatePayoutRailMicroDepositResult,
} from "./types"

/**
 * In-process μ-deposit amounts (current Fastt behavior).
 * Does not move money; admin/harness receives plaintext cents.
 */
export async function initiateSimulatedMicroDeposit(
	_input: InitiatePayoutRailMicroDepositInput
): Promise<InitiatePayoutRailMicroDepositResult> {
	const amount1 = randomInt(1, 99)
	let amount2 = randomInt(1, 99)
	if (amount2 === amount1) amount2 = amount1 === 99 ? 98 : amount1 + 1

	return {
		ok: true,
		provider: "simulated",
		mode: "simulated",
		depositAmountsCents: [amount1, amount2],
		externalRef: `sim_${_input.accountId.slice(0, 8)}_${Date.now()}`,
	}
}
