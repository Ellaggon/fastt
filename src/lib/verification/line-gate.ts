/**
 * Phase 5 — one publish and booking result per product.
 *
 * The applicable shared account checks stay. The product then adds only its
 * own line pack. A tour booking also checks the guide, vehicle, permit and
 * insurance of that departure. A lodging gap cannot block a tour, and a guide
 * gap cannot block a hotel.
 */

import { resolveCommercialPolicyRollout } from "@/lib/commercial-policy/rollout"
import { listProviderDocuments, type ProviderDocumentActivityClass } from "@/lib/provider-documents"
import { evaluateProviderGovernance } from "@/lib/provider-governance"
import { readProviderHolderProfile } from "@/lib/provider-holder-profile"
import {
	readTourComplianceContext,
	storedTourActivityClasses,
} from "@/lib/tours/tour-compliance-context"
import {
	collectionModelForCommercialLine,
	commercialLineForProductType,
	readProviderCommercialLineState,
	type CommercialLine,
} from "@/lib/verification/commercial-lines"
import { mayEnforceRequirement } from "@/lib/verification/policy-annex"
import {
	resolveVerificationRequirements,
	type VerificationRequirement,
} from "@/lib/verification/requirement-resolver"
import {
	diagnoseVerificationEvidence,
	normalizeVerificationEvidence,
	type VerificationEvidenceInput,
} from "@/lib/verification/evidence-diagnosis"
import {
	and,
	db,
	eq,
	first,
	Product,
	TourResourceAssignment,
} from "@/shared/infrastructure/db/compat"

export type LineGateCapability = "publish" | "booking"

export type LineGateBlocker = {
	id: string
	layer: "shared" | "lodging" | "tour" | "departure"
	label: string
	capabilities: LineGateCapability[]
}

export type LineGateEvidence = VerificationEvidenceInput

export type LineGateDepartureResource = {
	resourceId: string
	role: string
}

export type LineGateInput = {
	capability: LineGateCapability
	line: CommercialLine | null
	productId: string
	identityComplete: boolean
	operationsComplete: boolean
	verificationComplete: boolean
	fiscalComplete: boolean
	teamComplete: boolean
	paymentsComplete: boolean
	collectionModel: "undecided" | "property_collect" | "platform_collect" | null
	requirements: readonly VerificationRequirement[]
	evidence: readonly LineGateEvidence[]
	jurisdictionCode?: string | null
	activityClasses?: readonly string[]
	departure?: readonly LineGateDepartureResource[]
	/** When set, expiry is judged on this civil date. Booking passes the departure date. */
	evaluatedAt?: Date
}

export type LineGateDecision = {
	enforced: boolean
	allowed: boolean
	blockers: LineGateBlocker[]
}

const both: LineGateCapability[] = ["publish", "booking"]

function blocker(
	id: string,
	layer: LineGateBlocker["layer"],
	label: string,
	capabilities: LineGateCapability[] = both
): LineGateBlocker {
	return { id, layer, label, capabilities }
}

function covers(
	evidence: readonly LineGateEvidence[],
	requirement: Pick<VerificationRequirement, "id" | "layer" | "documentType">,
	context: {
		productId: string
		resourceId?: string | null
		territoryCodes?: string[]
		activityClasses?: string[]
		at?: Date
	}
) {
	return (
		diagnoseVerificationEvidence({
			requirement,
			evidence: normalizeVerificationEvidence(evidence),
			operation: {
				productId: context.productId,
				resourceId: context.resourceId,
				subjectReferences: context.resourceId ? [context.resourceId] : undefined,
				territoryCodes: context.territoryCodes,
				activityClasses: (context.activityClasses ?? []) as ProviderDocumentActivityClass[],
				at: context.at,
			},
		}).state === "ready"
	)
}

function operationContext(input: LineGateInput, resourceId?: string) {
	return {
		productId: input.productId,
		resourceId,
		territoryCodes: input.jurisdictionCode ? [input.jurisdictionCode] : [],
		activityClasses: [...(input.activityClasses ?? [])],
		at: input.evaluatedAt,
	}
}

export function evaluateProductLineGate(input: LineGateInput): LineGateDecision {
	const blockers: LineGateBlocker[] = []
	if (!input.identityComplete) {
		blockers.push(blocker("shared.identity", "shared", "Falta el nombre legal de la cuenta."))
	}
	if (!input.operationsComplete) {
		blockers.push(
			blocker("shared.operations", "shared", "Faltan zona horaria, moneda o correo de soporte.")
		)
	}
	if (!input.verificationComplete) {
		blockers.push(blocker("shared.verification", "shared", "La cuenta todavía no está aprobada."))
	}
	if (!input.fiscalComplete) {
		blockers.push(blocker("shared.fiscality", "shared", "El NIT todavía no está verificado."))
	}
	if (!input.teamComplete) {
		blockers.push(blocker("shared.team", "shared", "La cuenta no tiene un owner o un admin."))
	}
	if (input.collectionModel === "platform_collect" && !input.paymentsComplete) {
		blockers.push(
			blocker(
				"shared.payout_account",
				"shared",
				"Fastt liquida el cobro y falta la cuenta de pagos verificada."
			)
		)
	}

	const applicable = input.requirements.filter(
		(requirement) => requirement.layer === "shared" || requirement.layer === input.line
	)
	for (const requirement of applicable) {
		if (!mayEnforceRequirement(input.line, requirement.id)) continue
		// A guide credential is not provider-wide. Booking resolves it against
		// the guide actually assigned to the selected departure below.
		if (input.capability === "booking" && requirement.id === "tour.guide_credential") continue
		if (requirement.id === "shared.legal_name" || requirement.id === "shared.tax_document") continue
		if (requirement.id === "shared.address_proof") continue
		if (!requirement.documentType) {
			if (
				requirement.id === "tour.context_missing" ||
				requirement.id === "tour.operating_role_missing"
			) {
				blockers.push(blocker(requirement.id, "tour", requirement.appliesBecause))
			}
			continue
		}
		if (
			requirement.layer === "shared" &&
			requirement.id !== "shared.government_id" &&
			requirement.id !== "shared.business_registration"
		) {
			continue
		}
		if (covers(input.evidence, requirement, operationContext(input))) {
			continue
		}
		blockers.push(
			blocker(
				requirement.id,
				requirement.layer === "lodging"
					? "lodging"
					: requirement.layer === "tour"
						? "tour"
						: "shared",
				`Falta ${requirement.label.toLowerCase()} verificado para este producto.`
			)
		)
	}

	if (input.capability === "booking" && input.line === "tour") {
		blockers.push(...departureBlockers(input))
	}

	const applicableBlockers = blockers.filter((item) => item.capabilities.includes(input.capability))
	return {
		enforced: true,
		allowed: applicableBlockers.length === 0,
		blockers: applicableBlockers,
	}
}

function departureBlockers(input: LineGateInput): LineGateBlocker[] {
	const blockers: LineGateBlocker[] = []
	const departure = input.departure ?? []
	const guides = departure.filter((resource) => resource.role === "lead_guide")
	const vehicles = departure.filter((resource) => resource.role === "vehicle")
	// An operator can work with assigned guide staff. Once a departure names a
	// guide, their credential is required even if the product is sold by an
	// operator. Conversely, transport may be supplied by an approved third
	// party, so this gate never invents a vehicle requirement.
	const needsGuide =
		input.requirements.some((requirement) => requirement.id === "tour.guide_credential") ||
		guides.length > 0
	const needsInsurance = input.requirements.some(
		(requirement) => requirement.id === "tour.insurance"
	)

	if (needsGuide && guides.length === 0) {
		blockers.push(
			blocker("departure.guide", "departure", "Esta salida no tiene un guía asignado.", ["booking"])
		)
	}
	if (
		needsGuide &&
		guides.some(
			(guide) =>
				!covers(
					input.evidence,
					{ id: "tour.guide_credential", layer: "tour", documentType: "operating_license" },
					operationContext(input, guide.resourceId)
				)
		)
	) {
		blockers.push(
			blocker(
				"departure.guide",
				"departure",
				"La credencial de guía no cubre al guía de esta salida.",
				["booking"]
			)
		)
	}
	if (needsInsurance) {
		const targets = [...guides, ...vehicles]
		const uncovered =
			targets.length === 0
				? !covers(
						input.evidence,
						{ id: "tour.insurance", layer: "tour", documentType: "insurance" },
						operationContext(input)
					)
				: targets.some(
						(resource) =>
							!covers(
								input.evidence,
								{ id: "tour.insurance", layer: "tour", documentType: "insurance" },
								operationContext(input, resource.resourceId)
							)
					)
		if (uncovered) {
			blockers.push(
				blocker(
					"departure.insurance",
					"departure",
					"El seguro no cubre los recursos de esta salida.",
					["booking"]
				)
			)
		}
	}
	return blockers
}

export class ProductLineGateBlockedError extends Error {
	details: {
		productId: string
		capability: LineGateCapability
		blockers: LineGateBlocker[]
	}

	constructor(params: {
		productId: string
		capability: LineGateCapability
		blockers: LineGateBlocker[]
	}) {
		super("PRODUCT_LINE_GATE_BLOCKED")
		this.details = params
	}
}

function verifiedEvidence(
	documents: Awaited<ReturnType<typeof listProviderDocuments>>
): LineGateEvidence[] {
	return documents.map((document) => ({
		id: document.id,
		type: document.type,
		status: document.status,
		expiresAt: document.expiresAt,
		subjectType: document.subjectType,
		subjectReference: document.subjectReference,
		scopes: document.scopes.map((scope) => ({
			scopeType: scope.scopeType,
			productId: scope.productId,
			resourceId: scope.resourceId,
			territoryCode: scope.territoryCode,
			activityClass: scope.activityClass,
		})),
	}))
}

export function lineGateEvaluationDate(value: string | null | undefined): Date | undefined {
	const text = String(value ?? "").trim()
	if (!text) return undefined
	const parsed = new Date(text.length === 10 ? `${text}T00:00:00.000Z` : text)
	return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** Line gates follow the same rollout contract as commercial-policy enforcement. */
export function productLineGateEnforcementEnabled(params: {
	providerId?: string | null
	host?: string | null
	env?: Record<string, string | undefined>
}): boolean {
	return resolveCommercialPolicyRollout(params).enabled
}

export async function loadProductLineGate(params: {
	providerId: string
	productId: string
	capability: LineGateCapability
	departure?: readonly LineGateDepartureResource[]
	evaluatedAt?: Date
}): Promise<LineGateDecision> {
	if (!productLineGateEnforcementEnabled({ providerId: params.providerId })) {
		return { enforced: false, allowed: true, blockers: [] }
	}
	const product = await db
		.select({ productType: Product.productType })
		.from(Product)
		.where(and(eq(Product.id, params.productId), eq(Product.providerId, params.providerId)))
		.then(first)
	if (!product) {
		return {
			enforced: true,
			allowed: false,
			blockers: [
				blocker("product.missing", "shared", "No se encontró una oferta de este proveedor."),
			],
		}
	}
	const line = commercialLineForProductType(product?.productType)
	const [lineState, holder, governance, documents] = await Promise.all([
		readProviderCommercialLineState(params.providerId),
		readProviderHolderProfile(params.providerId).catch(() => null),
		evaluateProviderGovernance(params.providerId, { persist: false }),
		listProviderDocuments(params.providerId).catch(() => []),
	])
	if (!line) {
		return {
			enforced: true,
			allowed: false,
			blockers: [
				blocker(
					"product.line_unsupported",
					"shared",
					"Esta oferta no tiene una línea comercial verificable."
				),
			],
		}
	}
	if (!lineState.available) {
		return {
			enforced: true,
			allowed: false,
			blockers: [
				blocker(
					"verification.enrollment_unavailable",
					"shared",
					"No se pudo comprobar la inscripción de esta línea comercial."
				),
			],
		}
	}
	if (!lineState.lines.some((enrollment) => enrollment.line === line)) {
		return {
			enforced: true,
			allowed: false,
			blockers: [
				blocker(
					"verification.line_not_enrolled",
					line,
					"La línea comercial de esta oferta todavía no está inscrita para verificación."
				),
			],
		}
	}
	if (!holder) {
		return {
			enforced: true,
			allowed: false,
			blockers: [
				blocker(
					"verification.holder_missing",
					"shared",
					"Falta declarar el titular de la cuenta antes de verificar esta oferta."
				),
			],
		}
	}

	const tourContext =
		line === "tour" ? await readTourComplianceContext(params.productId, params.providerId) : null
	const activityClasses = storedTourActivityClasses(tourContext?.activityClassesJson)
	const holderType =
		holder?.holderType === "persona_natural" || holder?.holderType === "entidad"
			? holder.holderType
			: null
	const collectionModel = collectionModelForCommercialLine(lineState.lines, line)
	const ready = new Map(governance.readiness.map((check) => [check.id, check.complete]))
	const requirements = resolveVerificationRequirements({
		lines: line ? [line] : [],
		holderType,
		holderCountry: holder?.holderCountry ?? null,
		taxResidenceCountry: holder?.taxResidenceCountry ?? null,
		collectionModel,
		tours:
			line === "tour"
				? [
						{
							productId: params.productId,
							operatingRole:
								tourContext?.operatingRole === "operator" ||
								tourContext?.operatingRole === "guide" ||
								tourContext?.operatingRole === "intermediary"
									? tourContext.operatingRole
									: null,
							activityClasses,
							jurisdictionCode: tourContext?.jurisdictionCode ?? null,
							departureResourceIds: (params.departure ?? []).map((resource) => resource.resourceId),
						},
					]
				: [],
	})
	const decision = evaluateProductLineGate({
		capability: params.capability,
		line,
		productId: params.productId,
		identityComplete: Boolean(ready.get("identity")),
		operationsComplete: Boolean(ready.get("operations")),
		verificationComplete: Boolean(ready.get("verification")),
		fiscalComplete: Boolean(ready.get("fiscality")),
		teamComplete: Boolean(ready.get("team")),
		paymentsComplete: governance.capabilities.payments,
		collectionModel,
		requirements: requirements.requirements,
		evidence: verifiedEvidence(documents),
		jurisdictionCode: tourContext?.jurisdictionCode ?? null,
		activityClasses,
		departure: params.departure,
		evaluatedAt: params.evaluatedAt,
	})
	return { ...decision, enforced: true }
}

export async function assertProductLineGate(params: {
	providerId: string
	productId: string
	capability: LineGateCapability
	departure?: readonly LineGateDepartureResource[]
	evaluatedAt?: Date
}): Promise<LineGateDecision> {
	const enforceInVitest = process.env.FASTT_ENFORCE_LINE_GATE === "1"
	if (process.env.VITEST && !enforceInVitest)
		return { enforced: false, allowed: true, blockers: [] }
	const decision = await loadProductLineGate(params)
	if (decision.enforced && !decision.allowed) {
		throw new ProductLineGateBlockedError({
			productId: params.productId,
			capability: params.capability,
			blockers: decision.blockers,
		})
	}
	return decision
}

export async function departureResourcesForBooking(params: {
	variantId: string
	date: string
}): Promise<LineGateDepartureResource[]> {
	return db
		.select({
			resourceId: TourResourceAssignment.resourceId,
			role: TourResourceAssignment.role,
		})
		.from(TourResourceAssignment)
		.where(
			and(
				eq(TourResourceAssignment.variantId, params.variantId),
				eq(TourResourceAssignment.date, params.date)
			)
		)
		.then((rows) =>
			rows
				.map((row) => ({
					resourceId: String(row.resourceId ?? "").trim(),
					role: String(row.role ?? "").trim(),
				}))
				.filter((row) => row.resourceId.length > 0)
		)
		.catch(() => [])
}
