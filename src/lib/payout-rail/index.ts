import { logger } from "@/lib/observability/logger"

import { initiateSimulatedMicroDeposit } from "./simulated"
import {
	initiateStripeConnectMicroDeposit,
	isStripeConnectKeyPresent,
	isStripePayoutRailLiveEnabled,
	resolveStripeAchVerificationMethod,
} from "./stripeConnect"
import type {
	InitiatePayoutRailMicroDepositInput,
	InitiatePayoutRailMicroDepositResult,
	PayoutRailProviderId,
	PayoutRailStatus,
} from "./types"

export type {
	InitiatePayoutRailMicroDepositInput,
	InitiatePayoutRailMicroDepositResult,
	PayoutRailMode,
	PayoutRailProviderId,
	PayoutRailStatus,
} from "./types"

export {
	confirmStripeConnectMicroDeposit,
	createStripeFinancialConnectionsSession,
} from "./stripeConnect"

export function resolvePayoutRailPreference(): PayoutRailProviderId {
	const raw = String(process.env.PAYOUT_RAIL_PROVIDER ?? "simulated")
		.trim()
		.toLowerCase()
	if (raw === "stripe_connect" || raw === "stripe" || raw === "connect") return "stripe_connect"
	return "simulated"
}

/**
 * Honest rail status for host/admin UX.
 * Live ACH account verification only when preferred=stripe_connect, a key,
 * PAYOUT_RAIL_LIVE=1 and an approved live-money reference are all present.
 */
export function getPayoutRailStatus(): PayoutRailStatus {
	const preferredProvider = resolvePayoutRailPreference()
	const stripeKeyPresent = isStripeConnectKeyPresent()
	const liveEnabled = isStripePayoutRailLiveEnabled()
	const verificationMethod = resolveStripeAchVerificationMethod()

	if (preferredProvider === "simulated") {
		return {
			preferredProvider,
			activeProvider: "simulated",
			mode: "simulated",
			stripeKeyPresent,
			liveEnabled,
			hostLabel: "Verificación de prueba (simulado)",
			adminHint:
				"Rail simulado (default). La verificación ACH requiere Stripe Connect, PAYOUT_RAIL_LIVE=1 y FASTT_LIVE_MONEY_APPROVAL_REFERENCE. No habilita cobros ni liquidaciones.",
		}
	}

	if (!stripeKeyPresent) {
		return {
			preferredProvider,
			activeProvider: "simulated",
			mode: "not_configured",
			stripeKeyPresent: false,
			liveEnabled,
			hostLabel: "Verificación de prueba (simulado)",
			adminHint:
				"PAYOUT_RAIL_PROVIDER=stripe_connect pero falta STRIPE_SECRET_KEY — usando simulación. No hay ACH real.",
		}
	}

	if (!liveEnabled) {
		return {
			preferredProvider,
			activeProvider: "simulated",
			mode: "scaffold",
			stripeKeyPresent: true,
			liveEnabled: false,
			hostLabel: "Verificación de prueba (simulado — Connect listo)",
			adminHint:
				"Stripe key presente. Falta PAYOUT_RAIL_LIVE=1 o la referencia de aprobación para verificación ACH real. Mientras tanto μ-depósitos simulados; no hay cobros ni liquidaciones.",
		}
	}

	return {
		preferredProvider,
		activeProvider: "stripe_connect",
		mode: "live",
		stripeKeyPresent: true,
		liveEnabled: true,
		hostLabel:
			verificationMethod === "financial_connections"
				? "Verificación bancaria (Financial Connections)"
				: "Verificación bancaria (ACH μ-depósitos)",
		adminHint:
			verificationMethod === "financial_connections"
				? "ACH live: Financial Connections session (completar link en cliente)."
				: "ACH live: SetupIntent us_bank_account + verify_microdeposits.",
	}
}

/**
 * Initiate μ-deposit amounts via the configured rail.
 * Falls back to simulated until Stripe ACH live succeeds.
 */
export async function initiatePayoutRailMicroDeposit(
	input: InitiatePayoutRailMicroDepositInput
): Promise<InitiatePayoutRailMicroDepositResult> {
	const status = getPayoutRailStatus()

	if (status.preferredProvider === "stripe_connect") {
		const liveAttempt = await initiateStripeConnectMicroDeposit(input)
		if (liveAttempt.ok && liveAttempt.mode === "live") {
			logger.info("payout_rail.initiate.ok", {
				provider: liveAttempt.provider,
				mode: liveAttempt.mode,
				accountId: input.accountId,
			})
			return liveAttempt
		}

		logger.warn("payout_rail.stripe_fallback_simulated", {
			accountId: input.accountId,
			error: liveAttempt.error ?? "unknown",
			mode: liveAttempt.mode,
		})

		const simulated = await initiateSimulatedMicroDeposit(input)
		return {
			...simulated,
			mode: status.mode === "live" ? "scaffold" : status.mode,
			fallbackFrom: "stripe_connect",
			message: liveAttempt.message,
		}
	}

	const simulated = await initiateSimulatedMicroDeposit(input)
	logger.info("payout_rail.initiate.ok", {
		provider: simulated.provider,
		mode: simulated.mode,
		accountId: input.accountId,
	})
	return simulated
}
