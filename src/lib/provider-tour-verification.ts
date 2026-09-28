import type {
	CommercialPolicyBlocker,
	CommercialPolicyDiagnosis,
} from "@/lib/commercial-policy/evaluate"
import { routes } from "@/lib/routes"

export type TourVerificationProduct = {
	id: string
	name: string | null
	publicationState: string | null
}

export type TourVerificationAction = {
	label: string
	href: string | null
}

export type TourVerificationReadiness = {
	productId: string
	productName: string
	publicationState: string
	state: "ready" | "in_review" | "action_needed" | "waiting_on_fastt"
	stateLabel: string
	body: string
	paymentLabel: string
	paymentBody: string
	action: TourVerificationAction | null
	blockers: Array<{ id: string; body: string }>
	/** Account evidence explicitly allowed by the approved policy. */
	reusedAccountEvidenceCount: number
	/** Evidence that covers this experience; it is never inherited from a hotel. */
	experienceEvidenceCount: number
}

function scopedDocumentsHref(productId: string) {
	const target = new URL(routes.providerSettingsVerificationDocuments(), "http://fastt.local")
	target.searchParams.set("scopeProductId", productId)
	target.searchParams.set("returnTo", routes.productPreview(productId))
	return `${target.pathname}${target.search}`
}

function blockerDescription(blocker: CommercialPolicyBlocker) {
	switch (blocker.evidenceState) {
		case "pending_review":
			return "La evidencia aplicable ya fue enviada; falta la revisión de Fastt."
		case "rejected":
			return "La evidencia aplicable requiere cambios antes de habilitar esta experiencia."
		case "expired":
			return "La evidencia aplicable venció; carga una versión vigente con el mismo alcance."
		case "out_of_scope":
			return "Hay una evidencia verificada, pero no cubre esta experiencia, actividad, territorio o recurso."
		case "missing":
			return "Falta evidencia aplicable para esta experiencia."
		default:
			return blocker.action
	}
}

function actionForBlocker(
	product: TourVerificationProduct,
	blocker: CommercialPolicyBlocker
): TourVerificationAction | null {
	if (blocker.id.startsWith("requirement_")) {
		if (blocker.evidenceState === "pending_review") return null
		return { label: "Abrir evidencia de esta experiencia", href: scopedDocumentsHref(product.id) }
	}
	if (blocker.id.startsWith("holder_declaration_")) {
		return { label: "Revisar identidad del titular", href: routes.providerSettingsVerification() }
	}
	if (blocker.id === "product_location_missing") {
		return {
			label: "Completar ubicación de la experiencia",
			href: routes.productDetail(product.id),
		}
	}
	return null
}

/**
 * Converts the authoritative commercial diagnosis into provider language.
 * This must never infer that a provider-wide document covers a tour: only the
 * evaluator can place an item in `satisfiedRequirements`.
 */
export function buildTourVerificationReadiness(params: {
	product: TourVerificationProduct
	diagnosis: CommercialPolicyDiagnosis
}): TourVerificationReadiness {
	const { product, diagnosis } = params
	const publishAndBookingReady = diagnosis.capabilities.publish && diagnosis.capabilities.booking
	const firstBlocker = diagnosis.blockers.find((blocker) =>
		blocker.capabilities.some((capability) => capability === "publish" || capability === "booking")
	)
	const pendingReview = Boolean(
		firstBlocker?.evidenceState === "pending_review" ||
		firstBlocker?.id === "holder_declaration_in_review"
	)
	const policyWaiting = Boolean(
		firstBlocker?.id.startsWith("policy_context_") ||
		firstBlocker?.id.startsWith("policy_contract_")
	)
	const state = publishAndBookingReady
		? "ready"
		: pendingReview
			? "in_review"
			: policyWaiting
				? "waiting_on_fastt"
				: "action_needed"
	const stateLabel =
		state === "ready"
			? "Habilitada"
			: state === "in_review"
				? "En revisión"
				: state === "waiting_on_fastt"
					? "En espera de Fastt"
					: "Acción requerida"
	const body = publishAndBookingReady
		? "Esta experiencia ya cumple sus requisitos comerciales para publicar y aceptar reservas."
		: policyWaiting
			? "Fastt todavía no tiene una política comercial ratificada para esta combinación. No subas documentos adicionales hasta que se defina el requisito aplicable."
			: firstBlocker
				? blockerDescription(firstBlocker)
				: "Revisa los requisitos comerciales de esta experiencia."
	const paymentIsDirect =
		diagnosis.capabilityStates.collect_payment === "not_applicable" &&
		diagnosis.capabilityStates.payout === "not_applicable"
	const paymentLabel = paymentIsDirect
		? "Cobro directo del proveedor"
		: diagnosis.capabilities.collect_payment && diagnosis.capabilities.payout
			? "Cobro y liquidación con Fastt habilitados"
			: "Cobro y liquidación con Fastt sin habilitar"
	const paymentBody = paymentIsDirect
		? "Fastt no cobra ni liquida esta experiencia. Una cuenta de pagos no es requisito para publicarla o reservarla."
		: diagnosis.capabilities.collect_payment && diagnosis.capabilities.payout
			? "La política, el contrato y la cuenta de liquidación están habilitados para esta experiencia."
			: "No se prometerá cobro ni reembolso automático de Fastt hasta que contrato, política y liquidación estén aprobados."
	const visibleBlockers = Array.from(
		new Map(diagnosis.blockers.map((blocker) => [blockerDescription(blocker), blocker])).values()
	)
	const reusedAccountEvidenceCount = diagnosis.satisfiedRequirements.filter(
		(requirement) => requirement.evidenceScope === "provider"
	).length
	const experienceEvidenceCount =
		diagnosis.satisfiedRequirements.length - reusedAccountEvidenceCount

	return {
		productId: product.id,
		productName:
			String(product.name ?? "Experiencia sin nombre").trim() || "Experiencia sin nombre",
		publicationState: String(product.publicationState ?? "draft"),
		state,
		stateLabel,
		body,
		paymentLabel,
		paymentBody,
		action: firstBlocker ? actionForBlocker(product, firstBlocker) : null,
		blockers: visibleBlockers.slice(0, 3).map((blocker) => ({
			id: blocker.id,
			body: blockerDescription(blocker),
		})),
		reusedAccountEvidenceCount,
		experienceEvidenceCount,
	}
}
