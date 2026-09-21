import type { PolicyCategory } from "@/modules/policies/public"
import {
	getPolicyBusinessContract,
	type PolicyBusinessContract,
	type PolicyBusinessKind,
} from "@/lib/policies/policy-business-contract"

export type PolicyCompatibilityCandidate = {
	category: string
	stayLengthType?: unknown
	refundBasis?: unknown
	businesses?: readonly ("hotel" | "tour")[]
	rules?: Record<string, unknown> | null
	cancellationTiers?: Array<{
		daysBeforeArrival?: unknown
		hoursBeforeDeparture?: unknown
		penaltyType?: unknown
		penaltyAmount?: unknown
	}> | null
}

export type PolicyCompatibilityIssue = {
	code:
		| "policy_business_contract_missing"
		| "policy_category_not_supported"
		| "tour_stay_length_policy_not_supported"
		| "tour_cancellation_requires_hour_cutoff"
		| "tour_payment_type_not_supported"
		| "tour_no_show_basis_not_supported"
	message: string
}

export type PolicyBusinessContext = {
	productId: string
	productType: string
	business: PolicyBusinessKind
	contract: PolicyBusinessContract
}

function normalized(value: unknown): string {
	return String(value ?? "").trim()
}

function isPositive(value: unknown): boolean {
	const number = Number(value)
	return Number.isFinite(number) && number > 0
}

function supportedCategory(contract: PolicyBusinessContract, category: string): boolean {
	return contract.allowedCategories.includes(category as PolicyCategory)
}

/**
 * Shared, side-effect-free compatibility gate. Phase B uses it from options,
 * preview and assignment so UI filtering cannot be bypassed by direct calls.
 */
export function evaluatePolicyBusinessCompatibility(
	context: PolicyBusinessContext,
	candidate: PolicyCompatibilityCandidate
): PolicyCompatibilityIssue[] {
	const category = normalized(candidate.category)
	const { contract } = context
	if (context.business === "unknown") {
		return [
			{
				code: "policy_business_contract_missing",
				message: "Este tipo de negocio todavía no tiene un contrato de condiciones aprobado.",
			},
		]
	}
	if (!supportedCategory(contract, category)) {
		return [
			{
				code: "policy_category_not_supported",
				message:
					context.business === "tour"
						? "Esta condición pertenece a alojamientos. La presentación se gestiona en la salida del tour."
						: "Esta condición no está disponible para este tipo de negocio.",
			},
		]
	}
	if (
		candidate.businesses &&
		!candidate.businesses.includes(context.business as "hotel" | "tour")
	) {
		return [
			{
				code: "policy_category_not_supported",
				message: "Esta plantilla no está disponible para este tipo de negocio.",
			},
		]
	}

	if (context.business !== "tour") return []
	const rules = candidate.rules ?? {}
	if (category === "Payment") {
		const paymentType = normalized(rules.paymentType)
		if (!contract.payment.allowedTypes.includes(paymentType as "pay_at_property" | "prepayment")) {
			return [
				{
					code: "tour_payment_type_not_supported",
					message:
						"Los tours se pagan al proveedor durante la experiencia. El prepago no está disponible en Fastt.",
				},
			]
		}
	}

	if (category === "NoShow") {
		const penaltyType = normalized(rules.penaltyType)
		const normalizedBasis = penaltyType === "full" ? "total_booking" : penaltyType
		const refundBasis = normalized(candidate.refundBasis)
		if (
			!contract.noShow.allowedPenaltyBases.includes(
				normalizedBasis as "total_booking" | "percentage"
			) ||
			(refundBasis && refundBasis === "first_night")
		) {
			return [
				{
					code: "tour_no_show_basis_not_supported",
					message:
						"La no presentación de un tour debe usar el total de la reserva o un porcentaje; no se puede cobrar una noche.",
				},
			]
		}
	}

	if (category === "Cancellation") {
		const stayLengthType = normalized(candidate.stayLengthType || "any")
		if (stayLengthType !== "any") {
			return [
				{
					code: "tour_stay_length_policy_not_supported",
					message:
						"Las condiciones por estadía pertenecen a alojamientos y no se pueden asignar a un tour.",
				},
			]
		}
		const tiers = Array.isArray(candidate.cancellationTiers) ? candidate.cancellationTiers : []
		const hasDayOnlyLeadTime = tiers.some(
			(tier) =>
				isPositive(tier.daysBeforeArrival) &&
				!isPositive(tier.hoursBeforeDeparture) &&
				Number(tier.hoursBeforeDeparture) !== 0
		)
		if (hasDayOnlyLeadTime) {
			return [
				{
					code: "tour_cancellation_requires_hour_cutoff",
					message:
						"La cancelación de un tour necesita un plazo en horas antes de la salida programada.",
				},
			]
		}
	}

	return []
}

export function isPolicyBusinessCompatible(
	context: PolicyBusinessContext,
	candidate: PolicyCompatibilityCandidate
): boolean {
	return evaluatePolicyBusinessCompatibility(context, candidate).length === 0
}

export function policyBusinessContextFromProduct(params: {
	productId: unknown
	productType: unknown
}): PolicyBusinessContext {
	const productType = normalized(params.productType)
	const contract = getPolicyBusinessContract(productType)
	return {
		productId: normalized(params.productId),
		productType,
		business: contract.business,
		contract,
	}
}
