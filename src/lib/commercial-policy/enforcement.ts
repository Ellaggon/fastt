import { diagnoseCommercialPolicy } from "@/lib/commercial-policy/read"
import type { CommercialCapability } from "@/lib/commercial-policy/evaluate"
import { readProviderHolderProfile } from "@/lib/provider-holder-profile"
import {
	and,
	db,
	eq,
	first,
	GeoPlace,
	Product,
	ProductGeoPlace,
	ProviderDocument,
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
export function commercialPolicyEnforcementEnabled(): boolean {
	return ["1", "true", "yes"].includes(
		String(process.env.FASTT_ENFORCE_COMMERCIAL_POLICY ?? "")
			.trim()
			.toLowerCase()
	)
}

export async function assertProductCommercialCapability(params: {
	providerId: string
	productId: string
	capability: CommercialCapability
	/** Live money movement must always evaluate the approved policy, even in shadow rollout. */
	force?: boolean
}): Promise<void> {
	if (!params.force && !commercialPolicyEnforcementEnabled()) return
	const product = await db
		.select({ productType: Product.productType })
		.from(Product)
		.where(and(eq(Product.id, params.productId), eq(Product.providerId, params.providerId)))
		.then(first)
	const vertical = String(product?.productType ?? "").toLowerCase()
	if (!product || !["hotel", "tour", "whole_home"].includes(vertical)) {
		throw new CommercialPolicyBlockedError({
			productId: params.productId,
			capability: params.capability,
			blockers: [{ id: "policy_context_product_unsupported" }],
			action: "Selecciona una oferta con política comercial soportada.",
		})
	}
	const holder = await readProviderHolderProfile(params.providerId)
	if (!holder) {
		throw new CommercialPolicyBlockedError({
			productId: params.productId,
			capability: params.capability,
			blockers: [{ id: "holder_declaration_missing" }],
			action: "Declara el titular comercial antes de continuar.",
		})
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
		throw new CommercialPolicyBlockedError({
			productId: params.productId,
			capability: params.capability,
			blockers: [{ id: "product_location_missing" }],
			action: "Completa la ubicación principal de la oferta.",
		})
	}
	const evidence = await db
		.select({ type: ProviderDocument.type })
		.from(ProviderDocument)
		.where(
			and(
				eq(ProviderDocument.providerId, params.providerId),
				eq(ProviderDocument.status, "verified")
			)
		)
	const diagnosis = await diagnoseCommercialPolicy({
		context: {
			holderType: holder.holderType as "persona_natural" | "entidad",
			holderCountry: holder.holderCountry,
			taxCountry: holder.taxResidenceCountry,
			payoutCountry: holder.payoutCountry,
			productCountry: place.countryCode,
			vertical: vertical as "hotel" | "tour" | "whole_home",
			collectionModel: holder.collectionModel as
				| "undecided"
				| "property_collect"
				| "platform_collect",
		},
		verifiedEvidence: evidence.map((row) => row.type),
	})
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
