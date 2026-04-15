// Public API for the catalog module.
// External consumers MUST import from "@/modules/catalog/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Application use-cases
export * from "./application/use-cases/create-cancellation-policy"
export * from "./application/use-cases/create-provider"
export * from "./application/use-cases/create-product-subtype"
export * from "./application/use-cases/create-restriction"
export * from "./application/use-cases/create-tax"
export * from "./application/use-cases/delete-product"
export * from "./application/use-cases/delete-product-service"
export * from "./application/use-cases/delete-restriction"
export * from "./application/use-cases/delete-tax"
export * from "./application/use-cases/get-cancellation-policies"
export * from "./application/use-cases/get-restriction-rate-plans"
export * from "./application/use-cases/get-restriction-rooms"
export * from "./application/use-cases/get-restrictions"
export * from "./application/use-cases/get-taxes"
export * from "./application/use-cases/sync-product-services"
export * from "./application/use-cases/toggle-cancellation-policy-assignment"
export * from "./application/use-cases/update-cancellation-policy"
export * from "./application/use-cases/update-product-service"
export * from "./application/use-cases/update-product-subtype"
export * from "./application/use-cases/update-restriction"
export * from "./application/use-cases/update-tax"

// Provider V2 (parallel system)
export { registerProviderV2 } from "./application/use-cases/provider-v2/register-provider-v2"
export { upsertProviderProfileV2 } from "./application/use-cases/provider-v2/upsert-provider-profile-v2"
export { updateProviderIdentityV2 } from "./application/use-cases/provider-v2/update-provider-identity-v2"
export { setProviderVerificationV2 } from "./application/use-cases/provider-v2/set-provider-verification-v2"

// Product (canonical system)
export { createProduct } from "./application/use-cases/product/create-product"
export { upsertProductContent } from "./application/use-cases/product/upsert-product-content"
export { upsertProductLocation } from "./application/use-cases/product/upsert-product-location"
export { evaluateProductReadiness } from "./application/use-cases/product/evaluate-product-readiness"
export { getProductAggregate } from "./application/queries/getProductAggregate"
export {
	getProductFullAggregate,
	getProductVariantsAggregate,
	getVariantFullAggregate,
} from "./application/queries/getProductFullAggregate"
export { getAvailabilityAggregate } from "./application/queries/getAvailabilityAggregate"
export { getProviderFullAggregate } from "./application/queries/getProviderFullAggregate"
export { getProviderBookingsAggregate } from "./application/queries/getProviderBookingsAggregate"

// Variant (CAPA 3)
export * from "./application/use-cases/variant/create-variant"
export * from "./application/use-cases/variant/set-variant-capacity"
export * from "./application/use-cases/variant/attach-hotel-room-subtype"
export * from "./application/use-cases/variant/evaluate-variant-readiness"
export * from "./application/use-cases/variant/update-variant-status"

// Application ports (types/interfaces)
export * from "./application/ports/CancellationPolicyRepositoryPort"
export * from "./application/ports/CatalogRestrictionRepositoryPort"
export * from "./application/ports/HotelAmenityQueryRepositoryPort"
export * from "./application/ports/HotelRoomTypeRepositoryPort"
export * from "./application/ports/ImageQueryRepositoryPort"
export * from "./application/ports/ProductImageRepositoryPort"
export * from "./application/ports/ProductRepositoryPort"
export * from "./application/ports/ProductServiceQueryRepositoryPort"
export * from "./application/ports/ProductServiceRepositoryPort"
export * from "./application/ports/TaxFeeRepositoryPort"
export * from "./application/ports/ProviderV2RepositoryPort"
export * from "./application/ports/VariantManagementRepositoryPort"

// Lazy exports: these use-cases import external libs (AWS SDK). Keep module import side-effect free.
export type UpdateProductImagesParams = Parameters<
	typeof import("./application/use-cases/update-product-images").updateProductImages
>[0]

export async function updateProductImages(params: UpdateProductImagesParams) {
	const { updateProductImages } = await import("./application/use-cases/update-product-images")
	return updateProductImages(params)
}

// Runtime queries (wired in container). Kept as async wrappers so importing this public API
// doesn't eagerly load the container/DB in unit tests.
export async function resolveHotelAmenities(roomIds: string[]) {
	const { resolveHotelAmenities } = await import("@/container")
	return resolveHotelAmenities(roomIds)
}

export async function resolveHotelType(ids: string[]) {
	const { resolveHotelType } = await import("@/container")
	return resolveHotelType(ids)
}

export async function resolveProductImages(productId: string) {
	const { resolveProductImages } = await import("@/container")
	return resolveProductImages(productId)
}

export async function resolveProductServices(productId: string) {
	const { resolveProductServices } = await import("@/container")
	return resolveProductServices(productId)
}

export async function resolveRoomImages(roomTypeIds: string[]) {
	const { resolveRoomImages } = await import("@/container")
	return resolveRoomImages(roomTypeIds)
}

export async function getProductById(productId: string) {
	const { getProductById } = await import("@/container")
	return getProductById(productId)
}

export async function listProductServiceConfigs(productId: string) {
	const { listProductServiceConfigs } = await import("@/container")
	return listProductServiceConfigs(productId)
}

export async function getProductServiceConfig(params: { productId: string; serviceId: string }) {
	const { getProductServiceConfig } = await import("@/container")
	return getProductServiceConfig(params)
}

export async function listActiveCancellationPolicies() {
	const { listActiveCancellationPolicies } = await import("@/container")
	return listActiveCancellationPolicies()
}

export async function searchDestinations(params: { q: string; limit: number }) {
	const { searchDestinations } = await import("@/container")
	return searchDestinations(params)
}

export async function listMarketplaceHotelsByDestination(params: {
	destinationId: string
	limit?: number
}) {
	const { listMarketplaceHotelsByDestination } = await import("@/container")
	return listMarketplaceHotelsByDestination(params)
}
