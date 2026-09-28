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
	providerId: string
	productId: string
	resourceIds?: string[]
	subjectReferences?: string[]
	/** Trusted callers that already loaded the provider workspace may avoid duplicate evidence reads. */
	documents?: Awaited<ReturnType<typeof listProviderDocuments>>
	/** As above, this is an optimization only; external callers still resolve the holder server-side. */
	holder?: Awaited<ReturnType<typeof readProviderHolderProfile>>
}): Promise<ProductCommercialDiagnosis> {
	const product = await db
		.select({ productType: Product.productType })
		.from(Product)
		.where(and(eq(Product.id, params.productId), eq(Product.providerId, params.providerId)))
		.then(first)
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
	const holder =
		params.holder === undefined ? await readProviderHolderProfile(params.providerId) : params.holder
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
		return {
			productId: params.productId,
			providerId: params.providerId,
			vertical: vertical as ProductCommercialDiagnosis["vertical"],
			diagnosis: blockedDiagnosis(
				"holder_declaration_in_review",
				"La declaración del titular está en revisión; espera la aprobación antes de continuar."
			),
		}
	}
	const place = await db
		.select({ countryCode: GeoPlace.countryCode })
		.from(ProductGeoPlace)
		.innerJoin(GeoPlace, eq(ProductGeoPlace.placeId, GeoPlace.id))
		.where(
			and(eq(ProductGeoPlace.productId, params.productId), eq(ProductGeoPlace.isPrimary, true))
		)
		.then(first)
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
			? listProviderDocuments(params.providerId)
			: Promise.resolve(params.documents),
		vertical === "tour"
			? readTourComplianceContext(params.productId, params.providerId)
			: Promise.resolve(null),
		readProviderCommercialLineState(params.providerId),
	])
	const collectionModel = collectionModelForCommercialLine(
		commercialLines.lines,
		commercialLineForProductType(product.productType)
	)
	const evidence: CommercialEvidence[] = documents.map((document) => ({
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
	return {
		productId: params.productId,
		providerId: params.providerId,
		vertical: vertical as ProductCommercialDiagnosis["vertical"],
		diagnosis: await diagnoseCommercialPolicy({
			context: {
				holderType: holder.holderType as "persona_natural" | "entidad",
				holderCountry: holder.holderCountry,
				taxCountry: holder.taxResidenceCountry,
				payoutCountry: holder.payoutCountry,
				productCountry: place.countryCode,
				vertical: vertical as "hotel" | "tour" | "whole_home",
				collectionModel,
				productId: params.productId,
				jurisdictionCode: tourContext?.jurisdictionCode ?? null,
				operatingRole:
					(tourContext?.operatingRole as "operator" | "guide" | "intermediary" | null) ?? null,
				activityClasses,
				resourceIds: params.resourceIds ?? [],
				subjectReferences: params.subjectReferences ?? params.resourceIds ?? [],
			},
			evidence,
		}),
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
