export type PayoutRailProviderId = "simulated" | "stripe_connect"

/** What the product is actually running for μ-deposits right now. */
export type PayoutRailMode = "simulated" | "not_configured" | "scaffold" | "live"

export type PayoutRailStatus = {
	/** Env preference (`PAYOUT_RAIL_PROVIDER`). */
	preferredProvider: PayoutRailProviderId
	/** Provider that will generate/confirm amounts today. */
	activeProvider: PayoutRailProviderId
	mode: PayoutRailMode
	/** True when STRIPE_SECRET_KEY is present. */
	stripeKeyPresent: boolean
	/** True when PAYOUT_RAIL_LIVE opt-in is on. */
	liveEnabled: boolean
	/** Host-facing short label. */
	hostLabel: string
	/** Ops-facing explanation. */
	adminHint: string
}

export type InitiatePayoutRailMicroDepositInput = {
	accountId: string
	providerId: string
	actorUserId: string
	currency: string
	accountNumberLast4: string | null
	country: string | null
	/** Full account/IBAN — required for Stripe ACH live (never logged). */
	accountIdentifier?: string | null
	routingOrSwift?: string | null
	accountHolderName?: string | null
}

export type InitiatePayoutRailMicroDepositResult = {
	ok: boolean
	provider: PayoutRailProviderId
	mode: PayoutRailMode
	/** Plaintext cents for simulated / harness; null when a live rail sends bank credits. */
	depositAmountsCents: [number, number] | null
	externalRef: string | null
	error?: string
	message?: string
	/** When Connect was preferred but fell back to simulated. */
	fallbackFrom?: PayoutRailProviderId
	/** Financial Connections client_secret for host UI (ops/debug). */
	clientSecret?: string
	verificationMethod?: "microdeposits" | "financial_connections"
	/** SetupIntent already succeeded (instant verify). */
	alreadyVerified?: boolean
}
