import { resolveProductCommercialDiagnosis } from "@/lib/commercial-policy/enforcement"
import {
	liveMoneyExecutionInfrastructure,
	liveMoneyMovementRelease,
} from "@/lib/payments/live-money-activation"
import {
	presentFinancialContract,
	type FinancialContractPresentation,
} from "./financial-contract-presentation"
import { listProviderDocuments } from "@/lib/provider-documents"
import { readProviderHolderProfile } from "@/lib/provider-holder-profile"
import {
	collectionModelForCommercialLine,
	commercialLineForProductType,
	listProviderCommercialLines,
} from "@/lib/verification/commercial-lines"
import {
	and,
	db,
	eq,
	GeoPlace,
	Product,
	ProductGeoPlace,
	inArray,
} from "@/shared/infrastructure/db/compat"

export type ProviderContractOffering = FinancialContractPresentation & {
	productId: string
	name: string
	commercialLine: import("@/lib/verification/commercial-lines").CommercialLine | null
	verticalLabel: string
	collectionModelLabel: string
	country: string | null
	collectionModel: import("@/lib/verification/commercial-lines").CommercialLineCollectionModel
	platformCollectionAvailable: boolean
	platformPayoutAvailable: boolean
}

export type ProviderContractSurface = { offerings: ProviderContractOffering[] }

function modelLabel(value: unknown): string {
	if (value === "property_collect") return "El proveedor cobra al viajero"
	if (value === "platform_collect") return "Cobro por Fastt declarado (no disponible)"
	return "Aún por definir"
}

function verticalLabel(value: unknown): string {
	if (String(value).toLowerCase() === "tour") return "Experiencia"
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
		commercialLine: commercialLineForProductType(params.vertical),
		verticalLabel: verticalLabel(params.vertical),
		collectionModel: "undecided",
		collectionModelLabel: "No se pudo comprobar",
		country: params.country,
		status: "read_failed",
		statusLabel: "No se pudo comprobar",
		detail: params.detail,
		reasons: [
			{
				code: "contract_read_failed",
				message: params.detail,
				owner: "unknown",
				policyVersionId: null,
				action: null,
			},
		],
		primaryAction: null,
		platformCollectionAvailable: false,
		platformPayoutAvailable: false,
	}
}

/**
 * Provider-facing read model. It intentionally evaluates every offer instead
 * of inferring a payment permission from the provider-level declaration.
 */
export async function loadProviderContractSurface(
	providerId: string,
	options: { productIds?: readonly string[] | null; returnTo?: string } = {}
): Promise<ProviderContractSurface> {
	const returnTo = options.returnTo ?? "/financial?scope=all"
	const holder = await readProviderHolderProfile(providerId)
	const release = liveMoneyMovementRelease()
	const collectionInfrastructure = liveMoneyExecutionInfrastructure("collect_payment")

	const [products, commercialLines] = await Promise.all([
		db
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
			.where(
				and(
					eq(Product.providerId, providerId),
					options.productIds == null ? undefined : inArray(Product.id, [...options.productIds])
				)
			),
		listProviderCommercialLines(providerId),
	])

	const documents = holder ? await listProviderDocuments(providerId) : []
	const offerings: ProviderContractOffering[] = await Promise.all(
		products.map(async (product): Promise<ProviderContractOffering> => {
			const productId = String(product.id)
			const country = product.country ?? null
			const vertical = String(product.productType ?? "").toLowerCase()
			const collectionModel = collectionModelForCommercialLine(
				commercialLines,
				commercialLineForProductType(product.productType)
			)

			try {
				const { diagnosis: current } = await resolveProductCommercialDiagnosis({
					providerId,
					productId,
					holder,
					documents,
				})
				const presentation = presentFinancialContract({
					diagnosis: current,
					collectionModel,
					line: commercialLineForProductType(product.productType),
					productId,
					returnTo,
				})
				const platformCollectionAvailable =
					collectionModel === "platform_collect" &&
					current.capabilityStates.collect_payment === "allowed" &&
					release.enabled &&
					collectionInfrastructure.available
				const platformPayoutAvailable =
					collectionModel === "platform_collect" &&
					current.capabilityStates.payout === "allowed" &&
					release.enabled &&
					liveMoneyExecutionInfrastructure("payout").available
				return {
					productId,
					name: String(product.name || "Servicio"),
					commercialLine: commercialLineForProductType(product.productType),
					verticalLabel: verticalLabel(vertical),
					collectionModelLabel: modelLabel(collectionModel),
					country,
					collectionModel,
					...presentation,
					platformPayoutAvailable,
					platformCollectionAvailable,
				}
			} catch {
				return unavailableOffering({
					productId,
					name: String(product.name || "Servicio"),
					vertical,
					country,
					detail: "No pudimos comprobar las condiciones comerciales. Vuelve a intentarlo.",
				})
			}
		})
	)

	return { offerings }
}
