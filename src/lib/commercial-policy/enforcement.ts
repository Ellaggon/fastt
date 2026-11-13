import { experienceFormatReady, type ExperienceFormat } from "@/shared/domain/experience-format"
import { commercialReadOnce } from "./read-scope"
import {
	createServerTimingRecorder,
	type ServerTimingRecorder,
} from "@/lib/observability/serverTiming"
import { logRoutePerformance } from "@/lib/observability/performanceLog"
import { diagnoseCommercialPolicy } from "@/lib/commercial-policy/read"
import type {
	CommercialCapability,
	CommercialEvidence,
	CommercialPolicyDiagnosis,
} from "@/lib/commercial-policy/evaluate"
import { listProviderDocuments } from "@/lib/provider-documents"
import { readProviderHolderProfile } from "@/lib/provider-holder-profile"
import {
	readTourComplianceContext,
	storedTourActivityClasses,
} from "@/lib/tours/tour-compliance-context"
import { commercialPolicyEnforcementDecision } from "@/lib/commercial-policy/gate"
import { resolveCommercialPolicyRollout } from "@/lib/commercial-policy/rollout"
import { commercialAgreementStatus } from "@/modules/financial/commercial-agreements"
import { commercialAgreementRollout } from "@/modules/financial/commercial-agreement-rollout"
import {
	readTourOperation,
	operationSubjects,
	operationResourceIssue,
} from "@/shared/domain/tour-operation"
import {
	collectionModelForCommercialLine,
	commercialLineForProductType,
	readProviderCommercialLineState,
} from "@/lib/verification/commercial-lines"
import {
	and,
	db,
	eq,
	first,
	GeoPlace,
	Product,
	ProductGeoPlace,
	Tour,
	TourOperationalResource,
	inArray,
} from "@/shared/infrastructure/db/compat"

export class CommercialPolicyBlockedError extends Error {
	details: {
		productId: string
		capability: CommercialCapability
		blockers: unknown[]
		action: string
	}

	constructor(params: {
		productId: string
		capability: CommercialCapability
		blockers: unknown[]
		action: string
	}) {
		super("COMMERCIAL_POLICY_BLOCKED")
		this.details = params
	}
}

/**
 * The contract is rollout-controlled. A missing flag preserves the existing
 * authorization path while the product endpoint can still show its shadow diagnosis.
 */
export function commercialPolicyEnforcementEnabled(params?: {
	providerId?: string | null
	host?: string | null
	env?: Record<string, string | undefined>
}): boolean {
	return resolveCommercialPolicyRollout(params ?? {}).enabled
}

function blockedDiagnosis(id: string, action: string): CommercialPolicyDiagnosis {
	const capabilities = {
		publish: false,
		booking: false,
		collect_payment: false,
		payout: false,
		integrations: false,
	}
	return {
		policyStatus: "unsupported",
		capabilities,
		capabilityStates: {
			publish: "blocked",
			booking: "blocked",
			collect_payment: "blocked",
			payout: "blocked",
			integrations: "blocked",
		},
		blockers: [
			{
				id,
				capabilities: Object.keys(capabilities) as CommercialCapability[],
				action,
				policyVersionId: null,
			},
		],
		satisfiedRequirements: [],
		policyVersionIds: [],
	}
}

export type ProductCommercialDiagnosis = {
	provisionalCoverage?: CommercialPolicyDiagnosis | null
	productId: string
	providerId: string
	vertical: "hotel" | "tour" | "whole_home" | null
	diagnosis: CommercialPolicyDiagnosis
}

/**
 * Single server-side resolver for provider UI, publication and booking.
 * It never turns a provider-wide or expired document into product evidence by
 * inference: `evaluateCommercialPolicy` checks every declared scope.
 */
export async function resolveProductCommercialDiagnosis(params: {
	includeProvisionalCoverage?: boolean
	/** Internal policy simulation only; does not execute a publication command. */
	policyEvaluationAt?: Date
	providerId: string
	productId: string
	resourceIds?: string[]
	subjectReferences?: string[]
	/** Trusted callers that already loaded the provider workspace may avoid duplicate evidence reads. */
	documents?: Awaited<ReturnType<typeof listProviderDocuments>>
	/** As above, this is an optimization only; external callers still resolve the holder server-side. */
	holder?: Awaited<ReturnType<typeof readProviderHolderProfile>>
	agreementStatus?: Awaited<ReturnType<typeof commercialAgreementStatus>>
}): Promise<ProductCommercialDiagnosis> {
	const startedAt = performance.now()
	const timing = createServerTimingRecorder()
	try {
		return await resolveMeasuredCommercialDiagnosis(params, timing)
	} finally {
		timing.addTotal()
		logRoutePerformance({ name: "commercial.policy.resolve", startedAt, timing })
	}
}

async function resolveMeasuredCommercialDiagnosis(
	params: Parameters<typeof resolveProductCommercialDiagnosis>[0],
	timing: ServerTimingRecorder
): Promise<ProductCommercialDiagnosis> {
	const product = await timing.time("productContext", () =>
		db
			.select({
				productType: Product.productType,
				tourProductId: Tour.productId,
				experienceFormat: Tour.experienceFormat,
				formatContractVersion: Tour.formatContractVersion,
				countryCode: GeoPlace.countryCode,
			})
			.from(Product)
			.leftJoin(Tour, eq(Tour.productId, Product.id))
			.leftJoin(
				ProductGeoPlace,
				and(eq(ProductGeoPlace.productId, Product.id), eq(ProductGeoPlace.isPrimary, true))
			)
			.leftJoin(GeoPlace, eq(ProductGeoPlace.placeId, GeoPlace.id))
			.where(and(eq(Product.id, params.productId), eq(Product.providerId, params.providerId)))
			.limit(1)
			.then(first)
	)
	const vertical = String(product?.productType ?? "").toLowerCase()
	if (!product || !["hotel", "tour", "whole_home"].includes(vertical)) {
		return {
			productId: params.productId,
			providerId: params.providerId,
			vertical: null,
			diagnosis: blockedDiagnosis(
				"policy_context_product_unsupported",
				"Selecciona una oferta con política comercial soportada."
			),
		}
	}
	const format = product.tourProductId
		? {
				experienceFormat: product.experienceFormat,
				formatContractVersion: product.formatContractVersion,
			}
		: null
	if (vertical === "tour" && (!format || !experienceFormatReady(format)))
		return {
			productId: params.productId,
			providerId: params.providerId,
			vertical: "tour",
			diagnosis: blockedDiagnosis(
				"experience_format_missing",
				"Selecciona el tipo de experiencia antes de publicar o reservar."
			),
		}
	const holder =
		params.holder === undefined
			? await timing.time("holder", () =>
					commercialReadOnce(`holder:${params.providerId}`, () =>
						readProviderHolderProfile(params.providerId)
					)
				)
			: params.holder
	if (!holder) {
		return {
			productId: params.productId,
			providerId: params.providerId,
			vertical: vertical as ProductCommercialDiagnosis["vertical"],
			diagnosis: blockedDiagnosis(
				"holder_declaration_missing",
				"Declara el titular comercial antes de continuar."
			),
		}
	}
	if (holder.declarationStatus === "in_review") {
		const provisionalCoverage =
			vertical === "tour" && params.includeProvisionalCoverage
				? await resolveMeasuredCommercialDiagnosis(
						{
							...params,
							includeProvisionalCoverage: false,
							holder: { ...holder, declarationStatus: "declared" },
						},
						timing
					).then(
						({ diagnosis }) => diagnosis,
						() => null
					)
				: undefined
		return {
			provisionalCoverage,
			productId: params.productId,
			providerId: params.providerId,
			vertical: vertical as ProductCommercialDiagnosis["vertical"],
			diagnosis: blockedDiagnosis(
				"holder_declaration_in_review",
				"La declaración del titular está en revisión; espera la aprobación antes de continuar."
			),
		}
	}
	const place = { countryCode: product.countryCode }
	if (!place?.countryCode) {
		return {
			productId: params.productId,
			providerId: params.providerId,
			vertical: vertical as ProductCommercialDiagnosis["vertical"],
			diagnosis: blockedDiagnosis(
				"product_location_missing",
				"Completa la ubicación principal de la oferta."
			),
		}
	}
	const [documents, tourContext, commercialLines] = await Promise.all([
		params.documents === undefined
			? timing.time("documents", () =>
					commercialReadOnce(`documents:${params.providerId}`, () =>
						listProviderDocuments(params.providerId)
					)
				)
			: Promise.resolve(params.documents),
		vertical === "tour"
			? timing.time("operationContext", () =>
					readTourComplianceContext(params.productId, params.providerId)
				)
			: Promise.resolve(null),
		timing.time("commercialLines", () =>
			commercialReadOnce(`lines:${params.providerId}`, () =>
				readProviderCommercialLineState(params.providerId)
			)
		),
	])
	const collectionModel = collectionModelForCommercialLine(
		commercialLines.lines,
		commercialLineForProductType(product.productType)
	)
	const evidence: CommercialEvidence[] = documents.map((document) => ({
		definitionVersionId: document.definitionVersionId,
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
	const activityClasses = storedTourActivityClasses(tourContext?.activityClassesJson)
	const operation = readTourOperation(tourContext?.operationJson)
	if (tourContext?.operationJson != null && !operation)
		return {
			productId: params.productId,
			providerId: params.providerId,
			vertical: "tour",
			diagnosis: blockedDiagnosis(
				"policy_context_invalid_operation",
				"Revisa la declaración operativa de esta experiencia."
			),
		}
	const declaredIds = operation ? operationSubjects(operation) : []
	let declaredResources: Array<{ id: string; type: string }> = []
	if (declaredIds.length) {
		const resources = await timing.time("declaredResources", async () =>
			db
				.select({ id: TourOperationalResource.id, type: TourOperationalResource.type })
				.from(TourOperationalResource)
				.where(
					and(
						eq(TourOperationalResource.providerId, params.providerId),
						eq(TourOperationalResource.status, "active"),
						inArray(TourOperationalResource.id, declaredIds)
					)
				)
		)
		declaredResources = resources
		if (operation && operationResourceIssue(operation, resources))
			return {
				productId: params.productId,
				providerId: params.providerId,
				vertical: "tour",
				diagnosis: blockedDiagnosis(
					"policy_context_invalid_resources",
					"Revisa las personas y prestadores vinculados a la experiencia."
				),
			}
	}
	const productCountry = place.countryCode
	const diagnosis = await timing.time("policyDecision", () =>
		diagnoseCommercialPolicy({
			now: params.policyEvaluationAt,
			context: {
				providerId: params.providerId,
				evidenceSubjects: {
					holder: [params.providerId],
					guides: declaredResources
						.filter((resource) => resource.type === "guide")
						.map((resource) => resource.id),
					operator: operation?.operatorResourceId
						? [operation.operatorResourceId]
						: [params.providerId],
					resources: declaredResources.map((resource) => resource.id),
				},
				holderType: holder.holderType as "persona_natural" | "entidad",
				holderCountry: holder.holderCountry,
				legalFormCode: holder.legalFormCode ?? null,
				operation,
				taxCountry: holder.taxResidenceCountry,
				payoutCountry: holder.payoutCountry,
				productCountry,
				vertical: vertical as "hotel" | "tour" | "whole_home",
				collectionModel,
				productId: params.productId,
				experienceFormat: format?.experienceFormat as ExperienceFormat | null,
				formatContractVersion: format?.formatContractVersion ?? undefined,
				jurisdictionCode: tourContext?.jurisdictionCode ?? null,
				jurisdictionCodes: tourContext?.jurisdictionCodes ?? undefined,
				operatingRole:
					(tourContext?.operatingRole as "operator" | "guide" | "intermediary" | null) ?? null,
				activityClasses,
				resourceIds: [
					...new Set([...(params.resourceIds ?? []), ...(operation?.resourceIds ?? [])]),
				],
				subjectReferences: [
					...new Set([
						...(params.subjectReferences ?? params.resourceIds ?? []),
						...(operation ? operationSubjects(operation) : []),
					]),
				],
			},
			evidence,
		})
	)
	if (
		vertical === "tour" &&
		collectionModel === "property_collect" &&
		commercialAgreementRollout(params.providerId).enforce
	) {
		const agreement =
			params.agreementStatus ??
			(await commercialReadOnce(`agreement:${params.providerId}`, () =>
				commercialAgreementStatus(params.providerId)
			))
		if (agreement.state !== "active") {
			diagnosis.blockers.push({
				id: `agreement_${agreement.state === "acceptance_required" && !agreement.agreement ? "proposal_required" : agreement.state}`,
				capabilities: ["publish", "booking", "integrations"],
				action:
					agreement.state === "proposal_requested"
						? "Fastt está preparando la propuesta comercial de Tours."
						: agreement.state === "not_started"
							? "El acuerdo está aceptado y aún no inicia su vigencia."
							: "Completa el acuerdo comercial de Tours.",
				policyVersionId: null,
			})
			for (const capability of ["publish", "booking", "integrations"] as const) {
				diagnosis.capabilities[capability] = false
				diagnosis.capabilityStates[capability] = "blocked"
			}
		}
	}
	return {
		productId: params.productId,
		providerId: params.providerId,
		vertical: vertical as ProductCommercialDiagnosis["vertical"],
		diagnosis,
	}
}

export async function assertProductCommercialCapability(params: {
	providerId: string
	productId: string
	capability: CommercialCapability
	resourceIds?: string[]
	subjectReferences?: string[]
	/** Live money movement must always evaluate the approved policy, even in shadow rollout. */
	force?: boolean
	/** Tours use scoped operational evidence and cannot use the legacy bypass. */
	forceForTour?: boolean
}): Promise<void> {
	const enforceInVitest =
		process.env.FASTT_ENFORCE_COMMERCIAL_POLICY === "1" || params.force === true
	if (process.env.VITEST && !enforceInVitest) return

	const rollout = resolveCommercialPolicyRollout({ providerId: params.providerId })
	if (
		commercialPolicyEnforcementDecision({
			force: params.force,
			forceForTour: params.forceForTour,
			rolloutEnabled: rollout.enabled,
		}) === "skip"
	) {
		return
	}
	const resolved = await resolveProductCommercialDiagnosis(params)
	if (
		commercialPolicyEnforcementDecision({
			force: params.force,
			forceForTour: params.forceForTour,
			rolloutEnabled: rollout.enabled,
			vertical: resolved.vertical,
		}) === "skip"
	) {
		return
	}
	const { diagnosis } = resolved
	if (!diagnosis.capabilities[params.capability]) {
		const firstBlocker = diagnosis.blockers.find((blocker) =>
			blocker.capabilities.includes(params.capability)
		)
		throw new CommercialPolicyBlockedError({
			productId: params.productId,
			capability: params.capability,
			blockers: diagnosis.blockers,
			action: firstBlocker?.action ?? "Solicita revisión de políticas para esta oferta.",
		})
	}
}
