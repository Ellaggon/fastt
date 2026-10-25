import type { CommercialPolicyDiagnosis } from "./evaluate"
import type {
	CommercialLine,
	CommercialLineCollectionModel,
} from "@/lib/verification/commercial-lines"
import { verificationNavigationHref, verificationTabsFor } from "@/lib/verification/navigation"
import {
	commercialBlockerIsWaiting,
	tourCommercialAction,
} from "@/lib/tours/tourCommercialNavigation"

export type FinancialContractStatus =
	| "action_required"
	| "in_review"
	| "requirements_satisfied"
	| "unsupported"
	| "read_failed"
export type FinancialContractAction = { label: string; href: string }
export type FinancialContractReason = {
	code: string
	message: string
	owner: "provider" | "fastt" | "unknown"
	action: FinancialContractAction | null
	policyVersionId: string | null
}
export type FinancialContractPresentation = {
	status: FinancialContractStatus
	statusLabel: string
	detail: string
	reasons: FinancialContractReason[]
	primaryAction: FinancialContractAction | null
}

export function financialContractHref(
	returnTo: string,
	line: CommercialLine | null,
	productId?: string
): string {
	const url = new URL("/provider/settings/payments", "http://fastt.local")
	if (line) url.searchParams.set("scope", line === "tour" ? "tour" : "hotel")
	if (productId) url.searchParams.set("productId", productId)
	url.searchParams.set("returnTo", returnTo)
	return url.pathname + url.search
}

export function presentFinancialContract(input: {
	diagnosis: CommercialPolicyDiagnosis
	collectionModel: CommercialLineCollectionModel
	line: CommercialLine | null
	productId: string
	returnTo: string
}): FinancialContractPresentation {
	const { diagnosis, collectionModel, line, productId, returnTo } = input
	const verification = (type?: string) => {
		const url = new URL("/provider/settings/verification", "http://fastt.local")
		url.searchParams.set("returnTo", returnTo)
		const tab =
			type === "tax_document"
				? "fiscal"
				: type === "government_id" || type === "business_registration"
					? "identity"
					: line === "tour"
						? "activity"
						: "business"
		const href = verificationNavigationHref({
			url,
			line: line ?? "lodging",
			tab,
			experienceId: line === "tour" ? productId : null,
			navigation: {
				line,
				tab,
				experienceId: line === "tour" ? productId : null,
				lines: line ? [line] : [],
				tabs: verificationTabsFor(line ?? "lodging", collectionModel === "platform_collect"),
				fasttCollects: collectionModel === "platform_collect",
			},
		})
		const target = new URL(href, url)
		if (type) target.searchParams.set("type", type)
		return target.pathname + target.search
	}
	const support = new URL("/provider/support", "http://fastt.local")
	if (line) support.searchParams.set("line", line)
	support.searchParams.set("from", returnTo)
	const relevantCapabilities =
		collectionModel === "property_collect"
			? (["publish", "booking"] as const)
			: (["collect_payment", "payout"] as const)
	const relevantBlockers = diagnosis.blockers.filter(
		(blocker) =>
			blocker.id === "collection_model_undecided" ||
			relevantCapabilities.some((capability) => blocker.capabilities.includes(capability))
	)
	const reasons: FinancialContractReason[] = relevantBlockers.map((blocker) => {
		const requirement = diagnosis.applicableRequirements?.find(
			(item) =>
				`requirement_${item.key}` === blocker.id && item.policyVersionId === blocker.policyVersionId
		)
		const unsupported =
			blocker.id.startsWith("policy_context_unsupported") ||
			blocker.id.startsWith("policy_context_conflict") ||
			blocker.id.startsWith("policy_contract_")
		const review =
			blocker.id === "holder_declaration_in_review" ||
			blocker.id === "agreement_proposal_requested" ||
			blocker.id === "agreement_not_started" ||
			blocker.evidenceState === "pending_review"
		const type = requirement?.acceptedEvidence[0]
		let action: FinancialContractAction | null = null
		const tourAction = line === "tour" ? tourCommercialAction(blocker.id, productId) : null
		if (line === "tour" && commercialBlockerIsWaiting(blocker.id)) action = null
		else if (tourAction)
			action = { label: tourAction.label, href: financialContractHref(returnTo, line, productId) }
		else if (blocker.id.startsWith("agreement_") || blocker.id === "collection_model_undecided")
			action = {
				label: "Revisar acuerdo comercial",
				href: financialContractHref(returnTo, line, productId),
			}
		else if (unsupported)
			action = { label: "Consultar con Fastt", href: support.pathname + support.search }
		else if (blocker.id.startsWith("holder_declaration"))
			action = {
				label: review ? "Consultar revisión" : "Completar identidad",
				href: verification("government_id"),
			}
		else if (
			blocker.id === "product_location_missing" ||
			blocker.id === "policy_context_missing_product"
		)
			action = {
				label: "Completar ubicación",
				href: `/product/${encodeURIComponent(productId)}/location?returnTo=${encodeURIComponent(returnTo)}`,
			}
		else if (type)
			action = {
				label: review ? "Consultar revisión" : "Revisar documento",
				href: verification(type),
			}
		else
			action = {
				label: "Revisar condiciones",
				href: financialContractHref(returnTo, line, productId),
			}
		return {
			code: blocker.id,
			message: blocker.action,
			owner:
				unsupported ||
				blocker.id === "holder_declaration_in_review" ||
				(line === "tour" && commercialBlockerIsWaiting(blocker.id))
					? "fastt"
					: review
						? "unknown"
						: requirement ||
							  blocker.id === "holder_declaration_missing" ||
							  blocker.id.startsWith("agreement_") ||
							  blocker.id === "collection_model_undecided"
							? "provider"
							: "unknown",
			action,
			policyVersionId: blocker.policyVersionId,
		}
	})
	const unsupported =
		diagnosis.policyStatus === "unsupported" ||
		reasons.some((r) => r.code === "collection_model_undecided" && line === "tour")
	const inReview =
		reasons.length > 0 &&
		reasons.every(
			(r) =>
				r.code === "holder_declaration_in_review" ||
				r.code === "agreement_proposal_requested" ||
				r.code === "agreement_not_started" ||
				relevantBlockers.find((b) => b.id === r.code)?.evidenceState === "pending_review"
		)
	const satisfied =
		collectionModel !== "undecided" &&
		!unsupported &&
		reasons.length === 0 &&
		relevantCapabilities.every((capability) => diagnosis.capabilityStates[capability] === "allowed")
	const status: FinancialContractStatus = inReview
		? "in_review"
		: unsupported
			? "unsupported"
			: satisfied
				? "requirements_satisfied"
				: "action_required"
	const statusLabel = {
		in_review: "En revisión",
		unsupported: "Condiciones por definir",
		requirements_satisfied: "Requisitos satisfechos",
		action_required: "Información pendiente",
		read_failed: "No se pudo comprobar",
	}[status]
	return {
		status,
		statusLabel,
		detail:
			reasons[0]?.message ??
			(satisfied
				? collectionModel === "property_collect"
					? "Tu negocio cobra directamente al participante. Fastt no recibe ni transfiere ese pago."
					: "Los requisitos aplicables están satisfechos. La ejecución de dinero requiere infraestructura habilitada."
				: "Revisa las condiciones comerciales aplicables."),
		reasons,
		primaryAction: reasons[0]?.action ?? null,
	}
}

/** Group only the same cause, policy, owner and destination; each offering remains evaluated. */
export function groupFinancialContractReasons(
	offerings: readonly {
		productId: string
		name: string
		reasons: FinancialContractReason[]
		country?: string | null
		commercialLine?: CommercialLine | null
	}[]
) {
	const groups = new Map<
		string,
		FinancialContractReason & {
			offerings: { productId: string; name: string }[]
			causes: FinancialContractReason[]
		}
	>()
	for (const offering of offerings)
		for (const reason of offering.reasons) {
			const key = JSON.stringify([
				reason.code.startsWith("policy_context_unsupported_") && !reason.policyVersionId
					? "policy_context_unsupported"
					: reason.code,
				reason.message,
				reason.owner,
				reason.policyVersionId,
				reason.action,
				offering.country ?? null,
				offering.commercialLine ?? null,
			])
			const group = groups.get(key) ?? { ...reason, offerings: [], causes: [] }
			if (!group.offerings.some((row) => row.productId === offering.productId))
				group.offerings.push({ productId: offering.productId, name: offering.name })
			if (!group.causes.some((cause) => cause.code === reason.code)) group.causes.push(reason)
			groups.set(key, group)
		}
	return [...groups.values()]
}
