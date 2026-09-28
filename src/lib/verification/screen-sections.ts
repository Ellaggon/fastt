/**
 * Phase 4 — one verification page, sectioned by enrolled line.
 *
 * Shared identity stays in one section. Lodging and tours appear only when
 * that line is enrolled, each with its own progress. A requirement that does
 * not apply is absent from every denominator. Direct collection leaves the
 * Fastt payout account out of the progress for selling that experience.
 * Publish gates are unchanged.
 */

import { routes } from "@/lib/routes"
import type { CommercialLine } from "@/lib/verification/commercial-lines"
import type { VerificationRequirement } from "@/lib/verification/requirement-resolver"
import {
	diagnoseVerificationEvidence,
	evidenceStateDetail,
	normalizeVerificationEvidence,
	type VerificationEvidenceInput,
	type VerificationEvidenceOperation,
} from "@/lib/verification/evidence-diagnosis"

export type VerificationScreenItemState = "ready" | "in_review" | "action_needed" | "not_started"

export type VerificationScreenItem = {
	id: string
	label: string
	state: VerificationScreenItemState
	stateLabel: string
	/** Why the state needs attention. Only shown where scope changes the result. */
	stateDetail?: string | null
	countsTowardProgress: boolean
	href: string | null
}

export type VerificationScreenProgress = {
	readyCount: number
	totalCount: number
	inReviewCount: number
	actionRequiredCount: number
	notStartedCount: number
	readinessPercent: number
}

export type VerificationScreenSectionId = "shared" | "lodging" | "tour"

export type VerificationScreenSection = {
	id: VerificationScreenSectionId
	title: string
	description: string
	items: VerificationScreenItem[]
	progress: VerificationScreenProgress
	/** Shared items plus this line. Null on the shared section. */
	selling: VerificationScreenProgress | null
	sellingNote: string | null
}

export type VerificationScreen = {
	sections: VerificationScreenSection[]
	/** Every applicable item on the page. Payments is included only when Fastt collects. */
	applicable: VerificationScreenProgress
	paymentsCountsForSelling: boolean
}

export type VerificationScreenDocument = { type: string; status: string }

export type VerificationScreenSlot = {
	type: string
	state: "missing" | "pending" | "verified" | "rejected"
}

export type VerificationScreenInput = {
	lines: readonly CommercialLine[]
	collectionModel: "undecided" | "property_collect" | "platform_collect" | null
	requirements: readonly VerificationRequirement[]
	legalNameComplete: boolean
	accountStatus: string | null
	fiscalStatus: string | null
	paymentsState: VerificationScreenItemState
	documents: readonly VerificationScreenDocument[]
	/** Full evidence is supplied for an experience-specific tour diagnosis. */
	evidence?: readonly VerificationEvidenceInput[]
	tourOperation?: VerificationEvidenceOperation | null
	slots?: readonly VerificationScreenSlot[]
}

const stateLabels: Record<VerificationScreenItemState, string> = {
	ready: "Listo",
	in_review: "En revisión",
	action_needed: "Completar",
	not_started: "Sin iniciar",
}

function item(
	id: string,
	label: string,
	state: VerificationScreenItemState,
	href: string | null,
	countsTowardProgress = true,
	stateDetail: string | null = null
): VerificationScreenItem {
	return {
		id,
		label,
		state,
		stateLabel: stateLabels[state],
		stateDetail,
		countsTowardProgress,
		href,
	}
}

function tourEvidenceState(
	input: VerificationScreenInput,
	requirement: VerificationRequirement
): { state: VerificationScreenItemState; detail: string | null } {
	if (!input.evidence || !input.tourOperation) {
		return input.evidence
			? { state: "not_started", detail: "Selecciona una experiencia para comprobar el alcance." }
			: { state: documentState(input.documents, requirement.documentType as string), detail: null }
	}
	const diagnosis = diagnoseVerificationEvidence({
		requirement,
		evidence: normalizeVerificationEvidence(input.evidence),
		operation: input.tourOperation,
	})
	return { state: diagnosis.state, detail: evidenceStateDetail(diagnosis.reason) }
}

function progress(items: readonly VerificationScreenItem[]): VerificationScreenProgress {
	const counting = items.filter((entry) => entry.countsTowardProgress)
	const readyCount = counting.filter((entry) => entry.state === "ready").length
	const inReviewCount = counting.filter((entry) => entry.state === "in_review").length
	const actionRequiredCount = counting.filter((entry) => entry.state === "action_needed").length
	const notStartedCount = counting.filter((entry) => entry.state === "not_started").length
	const totalCount = counting.length
	return {
		readyCount,
		totalCount,
		inReviewCount,
		actionRequiredCount,
		notStartedCount,
		readinessPercent: totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0,
	}
}

function accountState(status: string | null): VerificationScreenItemState {
	const value = String(status ?? "")
		.trim()
		.toLowerCase()
	if (value === "approved") return "ready"
	if (value === "pending") return "in_review"
	if (value === "rejected") return "action_needed"
	return "not_started"
}

function documentState(
	documents: readonly VerificationScreenDocument[],
	type: string
): VerificationScreenItemState {
	const matches = documents.filter((row) => row.type === type)
	if (matches.some((row) => row.status === "verified")) return "ready"
	if (matches.some((row) => row.status === "pending")) return "in_review"
	if (matches.some((row) => row.status === "rejected")) return "action_needed"
	return "not_started"
}

function slotState(
	slots: readonly VerificationScreenSlot[] | undefined,
	type: string
): VerificationScreenItemState | null {
	const slot = slots?.find((entry) => entry.type === type)
	if (!slot) return null
	if (slot.state === "verified") return "ready"
	if (slot.state === "pending") return "in_review"
	if (slot.state === "rejected") return "action_needed"
	return "not_started"
}

function preferReady(
	...states: Array<VerificationScreenItemState | null>
): VerificationScreenItemState {
	const present = states.filter((state): state is VerificationScreenItemState => Boolean(state))
	if (present.includes("ready")) return "ready"
	if (present.includes("in_review")) return "in_review"
	if (present.includes("action_needed")) return "action_needed"
	return present[0] ?? "not_started"
}

function documentsHref(uploadValue: string) {
	const target = new URL(routes.providerSettingsVerificationDocuments(), "http://fastt.local")
	target.searchParams.set("type", uploadValue)
	return `${target.pathname}${target.search}`
}

/** Role, activity and territory live on the experience, not in the document drawer. */
function tourContextHref(productIds: readonly string[]) {
	const productId = productIds.find((id) => id.trim().length > 0)
	if (!productId) return routes.productCreate()
	return `${routes.providerSettingsVerification()}?line=tour&tab=activity&experience=${encodeURIComponent(productId)}#tour-operating-context`
}

function sellingNote(line: "lodging" | "tour", paymentsCount: boolean) {
	const subject = line === "tour" ? "esta experiencia" : "este alojamiento"
	return paymentsCount
		? `Para vender ${subject} cuentan la cuenta compartida y este paquete, incluida la liquidación de Fastt.`
		: `Para vender ${subject} cuentan la cuenta compartida y este paquete. Pagos no entra: Fastt no liquida este cobro.`
}

export function buildVerificationScreenSections(
	input: VerificationScreenInput
): VerificationScreen {
	const lines = new Set(input.lines)
	const paymentsCountsForSelling = input.collectionModel === "platform_collect"
	const requirements = input.requirements
	const byId = (id: string) => requirements.find((requirement) => requirement.id === id)

	const sharedItems: VerificationScreenItem[] = [
		item(
			"shared.legal_name",
			"Nombre legal y nombre comercial",
			input.legalNameComplete ? "ready" : "action_needed",
			`${routes.providerSettingsProfile()}#legalName`
		),
		item(
			"shared.account_review",
			"Cuenta revisada",
			accountState(input.accountStatus),
			routes.providerSettingsVerification()
		),
	]

	const identity = byId("shared.government_id")
	if (identity) {
		sharedItems.push(
			item(
				identity.id,
				identity.label,
				preferReady(
					slotState(input.slots, "government_id"),
					documentState(input.documents, "government_id")
				),
				`${routes.providerSettingsVerification()}?type=government_id#kyc-slots`
			)
		)
	}

	const registration = byId("shared.business_registration")
	if (registration) {
		sharedItems.push(
			item(
				registration.id,
				registration.label,
				preferReady(
					slotState(input.slots, "business_registration"),
					documentState(input.documents, "business_registration")
				),
				`${routes.providerSettingsVerification()}?type=business_registration#kyc-slots`
			)
		)
	}

	const tax = byId("shared.tax_document")
	if (tax) {
		const fiscalState =
			input.fiscalStatus === "verified"
				? "ready"
				: input.fiscalStatus === "pending"
					? "in_review"
					: input.fiscalStatus === "requires_attention"
						? "action_needed"
						: null
		sharedItems.push(
			item(
				tax.id,
				"NIT o identificación fiscal",
				preferReady(
					slotState(input.slots, "tax_document"),
					fiscalState,
					documentState(input.documents, "tax_document")
				),
				routes.providerSettingsVerificationFiscal()
			)
		)
	}

	const address = byId("shared.address_proof")
	if (paymentsCountsForSelling && address?.documentType) {
		sharedItems.push(
			item(
				address.id,
				address.label,
				documentState(input.documents, address.documentType),
				documentsHref(address.uploadValue ?? address.documentType)
			)
		)
	}

	if (paymentsCountsForSelling) {
		sharedItems.push(
			item(
				"shared.payout_account",
				"Cuenta de liquidación Fastt",
				input.paymentsState,
				routes.providerSettingsVerificationPayments()
			)
		)
	}

	const lodgingItems = requirements
		.filter((requirement) => requirement.layer === "lodging" && requirement.documentType)
		.map((requirement) =>
			item(
				requirement.id,
				requirement.label,
				documentState(input.documents, requirement.documentType as string),
				documentsHref(requirement.uploadValue ?? (requirement.documentType as string))
			)
		)

	const tourItems = requirements
		.filter((requirement) => requirement.layer === "tour")
		.map((requirement) => {
			const collectable = Boolean(requirement.documentType)
			const declaredGap =
				requirement.id === "tour.context_missing" ||
				requirement.id === "tour.operating_role_missing"
			if (!collectable && !declaredGap) {
				return item(requirement.id, requirement.label, "not_started", null, false)
			}
			const evidence = collectable ? tourEvidenceState(input, requirement) : null
			return item(
				requirement.id,
				requirement.label,
				collectable ? (evidence?.state ?? "not_started") : "action_needed",
				requirement.id === "tour.operating_role_missing"
					? null
					: collectable
						? documentsHref(requirement.uploadValue ?? (requirement.documentType as string))
						: tourContextHref(requirement.scopes.productIds),
				true,
				evidence?.detail ?? null
			)
		})

	const sharedForSelling = sharedItems.filter(
		(entry) =>
			entry.countsTowardProgress &&
			(paymentsCountsForSelling || entry.id !== "shared.payout_account")
	)

	const sections: VerificationScreenSection[] = [
		{
			id: "shared",
			title: "Cuenta compartida",
			description: paymentsCountsForSelling
				? "Identidad, registro de la entidad y NIT se resuelven una vez. Fastt liquida el cobro, así que la cuenta de pagos entra en este avance."
				: "Identidad, registro de la entidad y NIT se resuelven una vez. Si Fastt no liquida el cobro, Pagos queda fuera de este avance.",
			items: sharedItems,
			progress: progress(sharedItems),
			selling: null,
			sellingNote: null,
		},
	]

	if (lines.has("lodging")) {
		sections.push({
			id: "lodging",
			title: "Alojamientos",
			description:
				"Titularidad del inmueble y licencia del establecimiento. No se piden a un guía.",
			items: lodgingItems,
			progress: progress(lodgingItems),
			selling: progress([...sharedForSelling, ...lodgingItems]),
			sellingNote: sellingNote("lodging", paymentsCountsForSelling),
		})
	}

	if (lines.has("tour")) {
		sections.push({
			id: "tour",
			title: "Experiencias",
			description:
				"La credencial y el seguro aparecen según el papel, la actividad, el territorio y la salida.",
			items: tourItems,
			progress: progress(tourItems),
			selling: progress([...sharedForSelling, ...tourItems]),
			sellingNote: sellingNote("tour", paymentsCountsForSelling),
		})
	}

	return {
		sections,
		applicable: progress(sections.flatMap((section) => section.items)),
		paymentsCountsForSelling,
	}
}
