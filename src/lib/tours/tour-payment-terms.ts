import type { HoldPolicySnapshot } from "@/modules/policies/public"

/**
 * Tours currently support an in-person collection contract only. A prepayment
 * policy would promise a platform payment capability Fastt does not execute.
 */
export const TOUR_PAYMENT_TYPE = "pay_at_property" as const

export function isSupportedTourPaymentType(value: unknown): boolean {
	return String(value ?? "").trim() === TOUR_PAYMENT_TYPE
}

export function buildTourPaymentTerms(snapshot: Pick<HoldPolicySnapshot, "payment">) {
	const paymentType = snapshot.payment?.calculation?.payment?.paymentType
	if (!isSupportedTourPaymentType(paymentType)) {
		return {
			status: "unavailable" as const,
			recipient: null,
			timing: null,
			detail: "Esta salida todavía no tiene una forma de pago disponible.",
		}
	}
	return {
		status: "provider_at_experience" as const,
		recipient: "El proveedor del tour",
		timing: "Paga al proveedor al realizar el tour",
		detail: "Fastt confirma la reserva, pero no procesa este pago ni custodia fondos.",
	}
}
