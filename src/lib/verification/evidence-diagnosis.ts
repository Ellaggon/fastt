import {
	documentAppliesToOperation,
	isProviderDocumentExpired,
	type ProviderDocumentActivityClass,
	type ProviderDocumentRecord,
	type ProviderDocumentScopeRecord,
	type ProviderDocumentSubjectType,
} from "@/lib/provider-documents"
import type { VerificationRequirement } from "@/lib/verification/requirement-resolver"

/**
 * The evidence decision used by the provider forms, progress and line gate.
 * A tour requirement is deliberately product-scoped: a hotel licence, or a
 * generic account file, cannot silently enable a different experience.
 */
export type VerificationEvidenceDocument = Pick<
	ProviderDocumentRecord,
	"id" | "type" | "status" | "expiresAt" | "subjectType" | "subjectReference" | "scopes"
>

export type VerificationEvidenceOperation = {
	productId?: string | null
	resourceId?: string | null
	territoryCodes?: string[]
	activityClasses?: ProviderDocumentActivityClass[]
	subjectReferences?: string[]
	at?: Date
}

export type VerificationEvidenceState = "ready" | "in_review" | "action_needed" | "not_started"
export type VerificationEvidenceReason =
	| "satisfied"
	| "pending_review"
	| "rejected"
	| "expired"
	| "out_of_scope"
	| "missing"

export type VerificationEvidenceDiagnosis = {
	state: VerificationEvidenceState
	reason: VerificationEvidenceReason
	documentId: string | null
}

function scopeMatches(
	document: VerificationEvidenceDocument,
	operation: VerificationEvidenceOperation
): boolean {
	// A named holder is meaningful only when the operation names that holder.
	// Failing closed here prevents a credential attributed to Ana from covering
	// an unknown guide or an unrelated resource.
	if (
		document.subjectReference &&
		!operation.subjectReferences?.includes(document.subjectReference)
	) {
		return false
	}
	// A product-level check has no concrete departure resource yet. A file
	// limited only to a resource cannot attest the whole product.
	if (
		!operation.resourceId &&
		document.scopes.some((scope) => scope.scopeType === "resource") &&
		!document.scopes.some((scope) => scope.scopeType !== "resource")
	)
		return false
	// Preserve resource-specific evidence for the later departure check.
	const scopes = operation.resourceId
		? document.scopes
		: document.scopes.filter((scope) => scope.scopeType !== "resource")
	return documentAppliesToOperation(
		{
			// Scope and validity are diagnosed separately so an expired document
			// produces a renewal action instead of the misleading "out of scope".
			expiresAt: null,
			subjectReference: document.subjectReference,
			scopes,
		},
		operation
	)
}

function hasDeclaredTourScope(document: VerificationEvidenceDocument): boolean {
	return document.scopes.some(
		(scope) =>
			scope.scopeType === "product" ||
			scope.scopeType === "territory" ||
			scope.scopeType === "activity" ||
			scope.scopeType === "resource"
	)
}

function appliesToRequirement(
	document: VerificationEvidenceDocument,
	requirement: Pick<VerificationRequirement, "id" | "layer" | "documentType">,
	operation: VerificationEvidenceOperation,
	options: { allowUnboundGuide?: boolean } = {}
): boolean {
	if (!requirement.documentType || document.type !== requirement.documentType) return false
	if (
		(document.type === "ownership_proof" ||
			document.type === "operating_license" ||
			document.type === "insurance") &&
		!hasDeclaredTourScope(document)
	) {
		return false
	}
	if (requirement.id === "lodging.ownership_proof") {
		// Ownership is a fact about a concrete property. A provider-level deed or
		// a document scoped only to a territory cannot silently cover every hotel.
		if (
			!document.scopes.some(
				(scope) => scope.scopeType === "product" && scope.productId === operation.productId
			)
		)
			return false
	}
	if (requirement.id === "tour.guide_credential") {
		if (document.subjectType !== "person" && document.subjectType !== "resource") return false
		// The departure names a guide resource. A personal credential must name
		// that same checked subject; an anonymous person credential is not enough.
		if (!document.subjectReference && !options.allowUnboundGuide) return false
	}
	if (requirement.id === "tour.operator_license") {
		if (document.subjectType !== "provider" && document.subjectType !== "legal_entity") return false
		// An establishment licence can share type and territory with a tour
		// licence. The selected tour must be named in the reviewed scope.
		if (
			!document.scopes.some(
				(scope) => scope.scopeType === "product" && scope.productId === operation.productId
			)
		)
			return false
	}
	return scopeMatches(document, operation)
}

/**
 * Returns the single state a requirement may expose anywhere in the product.
 * Status precedence intentionally favours a verified, in-scope, valid file;
 * an unrelated hotel document remains an actionable scope error for tours.
 */
export function diagnoseVerificationEvidence(params: {
	requirement: Pick<VerificationRequirement, "id" | "layer" | "documentType">
	evidence: readonly VerificationEvidenceDocument[]
	operation: VerificationEvidenceOperation
}): VerificationEvidenceDiagnosis {
	const { requirement, evidence, operation } = params
	if (!requirement.documentType) {
		return { state: "not_started", reason: "missing", documentId: null }
	}
	const typed = evidence.filter((document) => document.type === requirement.documentType)
	const scoped = typed.filter((document) => appliesToRequirement(document, requirement, operation))
	const verified = scoped.find(
		(document) =>
			document.status === "verified" && !isProviderDocumentExpired(document.expiresAt, operation.at)
	)
	if (verified) return { state: "ready", reason: "satisfied", documentId: verified.id }
	const pending = scoped.find(
		(document) =>
			document.status === "pending" && !isProviderDocumentExpired(document.expiresAt, operation.at)
	)
	if (pending) return { state: "in_review", reason: "pending_review", documentId: pending.id }
	const expired = [
		...scoped,
		...typed.filter((document) =>
			appliesToRequirement(document, requirement, operation, { allowUnboundGuide: true })
		),
	].find(
		(document) =>
			document.status !== "superseded" &&
			isProviderDocumentExpired(document.expiresAt, operation.at)
	)
	if (expired) return { state: "action_needed", reason: "expired", documentId: expired.id }
	const rejected = scoped.find((document) => document.status === "rejected")
	if (rejected) return { state: "action_needed", reason: "rejected", documentId: rejected.id }
	if (typed.length)
		return { state: "action_needed", reason: "out_of_scope", documentId: typed[0]?.id ?? null }
	return { state: "not_started", reason: "missing", documentId: null }
}

export function evidenceStateDetail(reason: VerificationEvidenceReason): string | null {
	switch (reason) {
		case "pending_review":
			return "Enviada para esta experiencia; falta revisión."
		case "rejected":
			return "La evidencia aplicable requiere cambios."
		case "expired":
			return "La evidencia aplicable venció."
		case "out_of_scope":
			return "Hay una evidencia, pero no cubre esta experiencia."
		default:
			return null
	}
}

export type VerificationEvidenceInput = {
	id?: string
	type: string
	status: string
	expiresAt?: Date | string | null
	subjectType?: ProviderDocumentSubjectType | string | null
	subjectReference?: string | null
	scopes?: Array<{
		scopeType: ProviderDocumentScopeRecord["scopeType"] | string
		productId?: string | null
		resourceId?: string | null
		territoryCode?: string | null
		activityClass?: string | null
	}>
}

export function normalizeVerificationEvidence(
	evidence: readonly VerificationEvidenceInput[]
): VerificationEvidenceDocument[] {
	return evidence.map((document, index) => ({
		id: document.id ?? `evidence-${index}`,
		type: document.type as ProviderDocumentRecord["type"],
		status: document.status as ProviderDocumentRecord["status"],
		// Invalid supplied dates fail closed instead of becoming open-ended validity.
		expiresAt: document.expiresAt
			? Number.isNaN(new Date(document.expiresAt).getTime())
				? new Date(0)
				: new Date(document.expiresAt)
			: null,
		subjectType: (document.subjectType ?? "provider") as ProviderDocumentSubjectType,
		subjectReference: document.subjectReference ?? null,
		scopes: (document.scopes ?? []).map((scope, scopeIndex) => ({
			id: `${document.id ?? index}-${scopeIndex}`,
			scopeType: scope.scopeType as ProviderDocumentScopeRecord["scopeType"],
			productId: scope.productId ?? null,
			resourceId: scope.resourceId ?? null,
			territoryCode: scope.territoryCode ?? null,
			territoryLabel: null,
			activityClass: (scope.activityClass ?? null) as ProviderDocumentScopeRecord["activityClass"],
		})),
	}))
}
