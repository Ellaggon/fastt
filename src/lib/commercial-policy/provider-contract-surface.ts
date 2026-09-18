import { diagnoseCommercialPolicy } from "@/lib/commercial-policy/read"
import {
	liveMoneyExecutionInfrastructure,
	liveMoneyMovementRelease,
} from "@/lib/payments/live-money-activation"
import { readProviderHolderProfile } from "@/lib/provider-holder-profile"
import {
	and,
	db,
	eq,
	GeoPlace,
	Product,
	ProductGeoPlace,
	ProviderDocument,
} from "@/shared/infrastructure/db/compat"

type ContractStatus = "pending" | "in_review" | "approved" | "unavailable"

export type ProviderContractOffering = {
	productId: string
	name: string
	verticalLabel: string
	country: string | null
	status: ContractStatus
	statusLabel: string
	detail: string
	platformCollectionAvailable: boolean
}

export type ProviderContractSurface = {
	holderStatus: "missing" | "declared" | "in_review"
	holderModelLabel: string
	holderDetail: string
	offerings: ProviderContractOffering[]
	liveMoneyAvailable: boolean
	verificationHref: string
}

function modelLabel(value: unknown): string {
	if (value === "property_collect") return "El proveedor cobra al viajero"
	if (value === "platform_collect") return "Fastt cobra al viajero"
	return "Aún por definir"
}

function verticalLabel(value: unknown): string {
	if (String(value).toLowerCase() === "tour") return "Tour"
	if (String(value).toLowerCase() === "whole_home") return "Vivienda completa"
	return "Alojamiento"
}

function unavailableOffering(params: {
	productId: string
	name: string
	vertical: unknown
	country: string | null
	detail: string
}): ProviderContractOffering {
	return {
		productId: params.productId,
		name: params.name,
		verticalLabel: verticalLabel(params.vertical),
		country: params.country,
		status: "unavailable",
		statusLabel: "Sin flujo aprobado",
		detail: params.detail,
		platformCollectionAvailable: false,
	}
}

/**
 * Provider-facing read model. It intentionally evaluates every offer instead
 * of inferring a payment permission from the provider-level declaration.
 */
export async function loadProviderContractSurface(
	providerId: string
): Promise<ProviderContractSurface> {
	const verificationHref = "/provider/settings/verification/payments"
	const holder = await readProviderHolderProfile(providerId)
	const release = liveMoneyMovementRelease()
	const collectionInfrastructure = liveMoneyExecutionInfrastructure("collect_payment")

	const products = await db
		.select({
			id: Product.id,
			name: Product.name,
			productType: Product.productType,
			country: GeoPlace.countryCode,
		})
		.from(Product)
		.leftJoin(
			ProductGeoPlace,
			and(eq(ProductGeoPlace.productId, Product.id), eq(ProductGeoPlace.isPrimary, true))
		)
		.leftJoin(GeoPlace, eq(GeoPlace.id, ProductGeoPlace.placeId))
		.where(eq(Product.providerId, providerId))

	if (!holder) {
		return {
			holderStatus: "missing",
			holderModelLabel: "Aún por definir",
			holderDetail: "Completa la identidad comercial antes de revisar condiciones de cobro.",
			offerings: products.map((product) =>
				unavailableOffering({
					productId: String(product.id),
					name: String(product.name || "Servicio"),
					vertical: product.productType,
					country: product.country ?? null,
					detail: "Falta la declaración del titular comercial.",
				})
			),
			liveMoneyAvailable: false,
			verificationHref,
		}
	}

	const verifiedEvidence = await db
		.select({ type: ProviderDocument.type })
		.from(ProviderDocument)
		.where(
			and(eq(ProviderDocument.providerId, providerId), eq(ProviderDocument.status, "verified"))
		)
	const offerings: ProviderContractOffering[] = await Promise.all(
		products.map(async (product): Promise<ProviderContractOffering> => {
			const productId = String(product.id)
			const country = product.country ?? null
			const vertical = String(product.productType ?? "").toLowerCase()
			if (!country || !["hotel", "tour", "whole_home"].includes(vertical)) {
				return unavailableOffering({
					productId,
					name: String(product.name || "Servicio"),
					vertical,
					country,
					detail: country
						? "Esta actividad aún no tiene un contrato comercial soportado."
						: "Completa el país principal de la oferta para revisar su contrato.",
				})
			}

			try {
				const context = {
					holderType: holder.holderType as "persona_natural" | "entidad",
					holderCountry: holder.holderCountry,
					taxCountry: holder.taxResidenceCountry,
					payoutCountry: holder.payoutCountry,
					productCountry: country,
					vertical: vertical as "hotel" | "tour" | "whole_home",
				}
				const current = await diagnoseCommercialPolicy({
					context: {
						...context,
						collectionModel: holder.collectionModel as
							| "undecided"
							| "property_collect"
							| "platform_collect",
					},
					verifiedEvidence: verifiedEvidence.map((row) => row.type),
				})
				const platform = await diagnoseCommercialPolicy({
					context: { ...context, collectionModel: "platform_collect" },
					verifiedEvidence: verifiedEvidence.map((row) => row.type),
				})
				const platformPolicyApproved =
					platform.policyStatus === "supported" &&
					platform.capabilities.collect_payment &&
					platform.capabilities.payout
				const platformCollectionAvailable =
					platformPolicyApproved && release.enabled && collectionInfrastructure.available
				const approved =
					current.policyStatus === "supported" &&
					current.capabilities.collect_payment &&
					current.capabilities.payout
				const reviewPending = holder.declarationStatus === "in_review"
				return {
					productId,
					name: String(product.name || "Servicio"),
					verticalLabel: verticalLabel(vertical),
					country,
					status: reviewPending ? "in_review" : approved ? "approved" : "pending",
					statusLabel: reviewPending
						? "Declaración en revisión"
						: approved
							? "Contrato aprobado"
							: "Revisión pendiente",
					detail: reviewPending
						? "Los cambios de titular o jurisdicción requieren una nueva revisión."
						: approved
							? "Las condiciones contractuales aplicables están aprobadas para esta oferta."
							: "No hay una combinación contractual aprobada para cobrar y liquidar esta oferta.",
					platformCollectionAvailable,
				}
			} catch {
				return unavailableOffering({
					productId,
					name: String(product.name || "Servicio"),
					vertical,
					country,
					detail: "El contrato comercial aún no está disponible en este entorno.",
				})
			}
		})
	)

	return {
		holderStatus: holder.declarationStatus === "in_review" ? "in_review" : "declared",
		holderModelLabel: modelLabel(holder.collectionModel),
		holderDetail:
			holder.declarationStatus === "in_review"
				? "La declaración cambió y está pendiente de revisión."
				: "La declaración no autoriza por sí sola cobros ni liquidaciones.",
		offerings,
		liveMoneyAvailable: release.enabled && collectionInfrastructure.available,
		verificationHref,
	}
}
