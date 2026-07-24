import type {
	InitiatePayoutRailMicroDepositInput,
	InitiatePayoutRailMicroDepositResult,
	PayoutRailMode,
} from "./types"

export function isStripeConnectKeyPresent(): boolean {
	return Boolean(String(process.env.STRIPE_SECRET_KEY ?? "").trim())
}

/** Opt-in: real Stripe ACH (SetupIntent microdeposits / Financial Connections). */
export function isStripePayoutRailLiveEnabled(): boolean {
	const raw = String(process.env.PAYOUT_RAIL_LIVE ?? "")
		.trim()
		.toLowerCase()
	return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

/** Prefer Financial Connections session (instant) vs microdeposits SetupIntent. */
export function resolveStripeAchVerificationMethod(): "microdeposits" | "financial_connections" {
	const raw = String(process.env.PAYOUT_RAIL_VERIFICATION ?? "microdeposits")
		.trim()
		.toLowerCase()
	if (raw === "financial_connections" || raw === "fc" || raw === "instant") {
		return "financial_connections"
	}
	return "microdeposits"
}

function stripeSecret(): string {
	return String(process.env.STRIPE_SECRET_KEY ?? "").trim()
}

function stripeErrorMessage(json: Record<string, unknown>, fallback: string): string {
	if (
		typeof json.error === "object" &&
		json.error &&
		typeof (json.error as { message?: unknown }).message === "string"
	) {
		return String((json.error as { message: string }).message)
	}
	return fallback
}

async function stripeFormPost(
	path: string,
	body: Record<string, string>
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
	const key = stripeSecret()
	const response = await fetch(`https://api.stripe.com${path}`, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${key}`,
			"Content-Type": "application/x-www-form-urlencoded",
			// Pin a recent API that supports us_bank_account SetupIntent microdeposits.
			"Stripe-Version": "2024-11-20.acacia",
		},
		body: new URLSearchParams(body),
	})
	const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
	return { ok: response.ok, status: response.status, json }
}

function digitsOnly(value: string): string {
	return value.replace(/\D+/g, "")
}

function isUsCountry(country: string | null | undefined): boolean {
	const c = String(country ?? "")
		.trim()
		.toUpperCase()
	return c === "US" || c === "USA" || c === "UNITED STATES"
}

function parseExternalRef(externalRef: string): {
	kind: "setup_intent" | "legacy_source" | "unknown"
	setupIntentId?: string
	customerId?: string
	bankAccountId?: string
} {
	const raw = String(externalRef ?? "").trim()
	if (raw.startsWith("seti_")) {
		return { kind: "setup_intent", setupIntentId: raw }
	}
	const [customerId, bankAccountId] = raw.split(":").map((part) => part.trim())
	if (customerId?.startsWith("cus_") && bankAccountId?.startsWith("ba_")) {
		return { kind: "legacy_source", customerId, bankAccountId }
	}
	return { kind: "unknown" }
}

async function createStripeCustomer(input: InitiatePayoutRailMicroDepositInput, holder: string) {
	return stripeFormPost("/v1/customers", {
		"name": holder,
		"metadata[fastt_provider_id]": input.providerId,
		"metadata[fastt_account_id]": input.accountId,
		"metadata[fastt_actor_user_id]": input.actorUserId,
	})
}

/**
 * Financial Connections Session (instant bank link).
 * Returns client_secret for a host UI; μ-deposits are not started server-side.
 */
export async function createStripeFinancialConnectionsSession(params: {
	customerId: string
	providerId: string
	accountId: string
	returnUrl?: string | null
}): Promise<{
	ok: boolean
	sessionId?: string
	clientSecret?: string
	error?: string
	message?: string
}> {
	if (!isStripeConnectKeyPresent()) {
		return { ok: false, error: "not_configured", message: "Falta STRIPE_SECRET_KEY." }
	}
	const body: Record<string, string> = {
		"account_holder[type]": "customer",
		"account_holder[customer]": params.customerId,
		"permissions[0]": "payment_method",
		"prefetch[0]": "balances",
		"metadata[fastt_provider_id]": params.providerId,
		"metadata[fastt_account_id]": params.accountId,
	}
	const returnUrl = String(params.returnUrl ?? "").trim()
	if (returnUrl) body["return_url"] = returnUrl

	const session = await stripeFormPost("/v1/financial_connections/sessions", body)
	if (!session.ok || typeof session.json.id !== "string") {
		return {
			ok: false,
			error: "financial_connections_session_failed",
			message: stripeErrorMessage(session.json, `stripe_fc_http_${session.status}`),
		}
	}
	const clientSecret =
		typeof session.json.client_secret === "string" ? session.json.client_secret : undefined
	if (!clientSecret) {
		return {
			ok: false,
			error: "financial_connections_missing_secret",
			message: "Stripe no devolvió client_secret para Financial Connections.",
		}
	}
	return { ok: true, sessionId: session.json.id, clientSecret }
}

/**
 * Modern ACH initiate: SetupIntent + us_bank_account + microdeposits verification.
 * Financial Connections path creates a session (needs host UI to finish).
 */
export async function initiateStripeConnectMicroDeposit(
	input: InitiatePayoutRailMicroDepositInput
): Promise<InitiatePayoutRailMicroDepositResult> {
	if (!isStripeConnectKeyPresent()) {
		return {
			ok: false,
			provider: "stripe_connect",
			mode: "not_configured",
			depositAmountsCents: null,
			externalRef: null,
			error: "not_configured",
			message: "Falta STRIPE_SECRET_KEY. Configura Connect o usa PAYOUT_RAIL_PROVIDER=simulated.",
		}
	}

	if (!isStripePayoutRailLiveEnabled()) {
		return {
			ok: false,
			provider: "stripe_connect",
			mode: "scaffold",
			depositAmountsCents: null,
			externalRef: null,
			error: "stripe_connect_live_disabled",
			message:
				"Stripe key presente. Activa PAYOUT_RAIL_LIVE=1 para ACH live (US). Sin eso se usa simulación.",
		}
	}

	const accountNumber = String(input.accountIdentifier ?? "")
		.trim()
		.replace(/\s+/g, "")
	const routing = digitsOnly(String(input.routingOrSwift ?? ""))
	const holder = String(input.accountHolderName ?? "").trim() || "Fastt Provider"
	const verification = resolveStripeAchVerificationMethod()

	if (!isUsCountry(input.country)) {
		return {
			ok: false,
			provider: "stripe_connect",
			mode: "scaffold",
			depositAmountsCents: null,
			externalRef: null,
			error: "stripe_ach_us_bank_required",
			message: "ACH live (SetupIntent / Financial Connections) requiere país US.",
		}
	}

	try {
		const customer = await createStripeCustomer(input, holder)
		if (!customer.ok || typeof customer.json.id !== "string") {
			return {
				ok: false,
				provider: "stripe_connect",
				mode: "scaffold",
				depositAmountsCents: null,
				externalRef: null,
				error: "stripe_customer_failed",
				message: stripeErrorMessage(customer.json, `stripe_customer_http_${customer.status}`),
			}
		}
		const customerId = customer.json.id

		if (verification === "financial_connections") {
			const session = await createStripeFinancialConnectionsSession({
				customerId,
				providerId: input.providerId,
				accountId: input.accountId,
				returnUrl: process.env.PUBLIC_APP_URL
					? `${String(process.env.PUBLIC_APP_URL).replace(/\/$/, "")}/provider/settings/payments`
					: null,
			})
			if (!session.ok || !session.sessionId || !session.clientSecret) {
				return {
					ok: false,
					provider: "stripe_connect",
					mode: "scaffold",
					depositAmountsCents: null,
					externalRef: customerId,
					error: session.error ?? "financial_connections_failed",
					message: session.message,
				}
			}
			const mode: PayoutRailMode = "live"
			return {
				ok: true,
				provider: "stripe_connect",
				mode,
				depositAmountsCents: null,
				externalRef: session.sessionId,
				message:
					"Financial Connections session creada. Completa el link bancario en el cliente (client_secret en metadata ops).",
				clientSecret: session.clientSecret,
				verificationMethod: "financial_connections",
			}
		}

		if (routing.length !== 9 || accountNumber.length < 4) {
			return {
				ok: false,
				provider: "stripe_connect",
				mode: "scaffold",
				depositAmountsCents: null,
				externalRef: customerId,
				error: "stripe_ach_us_bank_required",
				message: "μ-depósitos SetupIntent requieren routing de 9 dígitos y número de cuenta (US).",
			}
		}

		const currency =
			String(input.currency || "usd")
				.trim()
				.toLowerCase() || "usd"
		const acceptedAt = String(Math.floor(Date.now() / 1000))

		const setup = await stripeFormPost("/v1/setup_intents", {
			"customer": customerId,
			"payment_method_types[0]": "us_bank_account",
			"payment_method_options[us_bank_account][verification_method]": "microdeposits",
			"usage": "off_session",
			"confirm": "true",
			"payment_method_data[type]": "us_bank_account",
			"payment_method_data[billing_details][name]": holder,
			"payment_method_data[us_bank_account][account_holder_type]": "company",
			"payment_method_data[us_bank_account][routing_number]": routing,
			"payment_method_data[us_bank_account][account_number]": accountNumber,
			"mandate_data[customer_acceptance][type]": "offline",
			"mandate_data[customer_acceptance][accepted_at]": acceptedAt,
			"metadata[fastt_provider_id]": input.providerId,
			"metadata[fastt_account_id]": input.accountId,
			"metadata[fastt_currency]": currency,
		})

		if (!setup.ok || typeof setup.json.id !== "string") {
			return {
				ok: false,
				provider: "stripe_connect",
				mode: "scaffold",
				depositAmountsCents: null,
				externalRef: customerId,
				error: "stripe_setup_intent_failed",
				message: stripeErrorMessage(setup.json, `stripe_setup_intent_http_${setup.status}`),
			}
		}

		const status = String(setup.json.status ?? "")
		const nextAction =
			setup.json.next_action && typeof setup.json.next_action === "object"
				? (setup.json.next_action as Record<string, unknown>)
				: null
		const nextType = String(nextAction?.type ?? "")
		const awaitingMicrodeposits =
			status === "requires_action" &&
			(nextType.includes("microdeposit") || nextType === "verify_with_microdeposits")

		if (status === "succeeded") {
			// Instant verification (rare without FC) — treat as live ready; no amounts to confirm.
			return {
				ok: true,
				provider: "stripe_connect",
				mode: "live",
				depositAmountsCents: null,
				externalRef: setup.json.id,
				message: "SetupIntent ACH verificado al instante (sin μ-depósitos pendientes).",
				verificationMethod: "microdeposits",
				alreadyVerified: true,
			}
		}

		if (!awaitingMicrodeposits && status !== "requires_payment_method") {
			// Still treat requires_action / processing as initiated when we have a SetupIntent id.
			if (status !== "requires_action" && status !== "processing") {
				return {
					ok: false,
					provider: "stripe_connect",
					mode: "scaffold",
					depositAmountsCents: null,
					externalRef: setup.json.id,
					error: "stripe_setup_intent_unexpected_status",
					message: `SetupIntent status inesperado: ${status || "unknown"}`,
				}
			}
		}

		const mode: PayoutRailMode = "live"
		return {
			ok: true,
			provider: "stripe_connect",
			mode,
			depositAmountsCents: null,
			externalRef: setup.json.id,
			message:
				"ACH live (SetupIntent μ-depósitos). Stripe envía depósitos al banco; confirma con montos o código SM.",
			verificationMethod: "microdeposits",
		}
	} catch (error) {
		return {
			ok: false,
			provider: "stripe_connect",
			mode: "scaffold",
			depositAmountsCents: null,
			externalRef: null,
			error: "stripe_request_failed",
			message: error instanceof Error ? error.message : String(error),
		}
	}
}

/**
 * Confirm μ-deposit amounts (or descriptor code) against Stripe.
 * Supports SetupIntent (`seti_…`) and legacy Customer bank source (`cus_:ba_`).
 */
export async function confirmStripeConnectMicroDeposit(params: {
	externalRef: string
	amount1Cents: number
	amount2Cents: number
	descriptorCode?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
	if (!isStripeConnectKeyPresent()) {
		return { ok: false, error: "not_configured", message: "Falta STRIPE_SECRET_KEY." }
	}

	const parsed = parseExternalRef(params.externalRef)
	if (parsed.kind === "unknown") {
		if (String(params.externalRef).startsWith("fcsess_")) {
			return {
				ok: false,
				error: "financial_connections_pending_ui",
				message:
					"Financial Connections requiere completar el link en el cliente antes de confirmar.",
			}
		}
		return { ok: false, error: "invalid_external_ref", message: "Referencia Stripe inválida." }
	}

	try {
		if (parsed.kind === "setup_intent" && parsed.setupIntentId) {
			const body: Record<string, string> = {}
			const code = String(params.descriptorCode ?? "")
				.trim()
				.toUpperCase()
			if (code && /^SM[A-Z0-9]{4}$/.test(code)) {
				body.descriptor_code = code
			} else {
				body["amounts[0]"] = String(params.amount1Cents)
				body["amounts[1]"] = String(params.amount2Cents)
			}
			const verified = await stripeFormPost(
				`/v1/setup_intents/${encodeURIComponent(parsed.setupIntentId)}/verify_microdeposits`,
				body
			)
			if (!verified.ok) {
				return {
					ok: false,
					error: "stripe_verify_failed",
					message: stripeErrorMessage(verified.json, `stripe_verify_http_${verified.status}`),
				}
			}
			return { ok: true }
		}

		if (parsed.kind === "legacy_source" && parsed.customerId && parsed.bankAccountId) {
			const verified = await stripeFormPost(
				`/v1/customers/${encodeURIComponent(parsed.customerId)}/sources/${encodeURIComponent(parsed.bankAccountId)}/verify`,
				{
					"amounts[0]": String(params.amount1Cents),
					"amounts[1]": String(params.amount2Cents),
				}
			)
			if (!verified.ok) {
				return {
					ok: false,
					error: "stripe_verify_failed",
					message: stripeErrorMessage(verified.json, `stripe_verify_http_${verified.status}`),
				}
			}
			return { ok: true }
		}

		return { ok: false, error: "invalid_external_ref", message: "Referencia Stripe inválida." }
	} catch (error) {
		return {
			ok: false,
			error: "stripe_request_failed",
			message: error instanceof Error ? error.message : String(error),
		}
	}
}
