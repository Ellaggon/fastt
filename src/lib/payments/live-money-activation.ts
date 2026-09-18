import {
	assertProductCommercialCapability,
	CommercialPolicyBlockedError,
} from "@/lib/commercial-policy/enforcement"
import { assertProviderCapability } from "@/lib/provider-governance"

export type LiveMoneyOperation = "collect_payment" | "payout"

export class LiveMoneyActivationBlockedError extends Error {
	code: string
	action: string

	constructor(code: string, action: string) {
		super(code)
		this.code = code
		this.action = action
	}
}

function enabled(value: unknown): boolean {
	return ["1", "true", "yes", "on"].includes(
		String(value ?? "")
			.trim()
			.toLowerCase()
	)
}

/**
 * A release is intentionally separate from a provider's collection choice.
 * It is set only by operations after the signed contract and processor scope
 * have been approved for the environment.
 */
export function liveMoneyMovementRelease() {
	const approvalReference = String(process.env.FASTT_LIVE_MONEY_APPROVAL_REFERENCE ?? "").trim()
	return {
		enabled: enabled(process.env.FASTT_ENABLE_LIVE_MONEY_MOVEMENT) && Boolean(approvalReference),
		approvalReference: approvalReference || null,
	}
}

/**
 * Fastt currently has no processor adapter that captures a traveler payment or
 * sends a provider settlement. Bank-account verification is deliberately not
 * evidence that either capability exists.
 */
export function liveMoneyExecutionInfrastructure(operation: LiveMoneyOperation) {
	return {
		available: false,
		reason:
			operation === "collect_payment"
				? "No hay un procesador de cobro al viajero habilitado."
				: "No hay un ejecutor de liquidaciones a proveedores habilitado.",
	}
}

/**
 * Required guard for a future capture or payout executor. It never derives an
 * authorization from `collectionModel`: it rechecks the approved commercial
 * policy and the provider's independently verified payment readiness.
 */
export async function assertLiveMoneyMovementAuthorized(params: {
	providerId: string
	productId: string
	operation: LiveMoneyOperation
	currentUserId?: string | null
}) {
	const release = liveMoneyMovementRelease()
	if (!release.enabled) {
		throw new LiveMoneyActivationBlockedError(
			"live_money_release_not_approved",
			"Fastt aún no tiene una liberación contractual aprobada para operar dinero real."
		)
	}

	await assertProviderCapability({
		providerId: params.providerId,
		currentUserId: params.currentUserId ?? null,
		capability: "payments",
	})

	try {
		await assertProductCommercialCapability({
			providerId: params.providerId,
			productId: params.productId,
			capability: params.operation,
			force: true,
		})
	} catch (error) {
		if (error instanceof CommercialPolicyBlockedError) {
			throw new LiveMoneyActivationBlockedError("commercial_policy_blocked", error.details.action)
		}
		throw error
	}

	const infrastructure = liveMoneyExecutionInfrastructure(params.operation)
	if (!infrastructure.available) {
		throw new LiveMoneyActivationBlockedError(
			"money_execution_infrastructure_unavailable",
			infrastructure.reason
		)
	}

	return { approvalReference: release.approvalReference }
}
