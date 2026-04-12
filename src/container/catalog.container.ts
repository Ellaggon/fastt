import { r2 } from "./shared.container"

import { SubtypeRepository } from "../modules/catalog/infrastructure/repositories/SubtypeRepository"
import { ProviderRepository } from "../modules/catalog/infrastructure/repositories/ProviderRepository"
import { ProviderV2Repository } from "../modules/catalog/infrastructure/repositories/ProviderV2Repository"
import { ProductRepository } from "../modules/catalog/infrastructure/repositories/ProductRepository"
import { TaxFeeRepository } from "../modules/catalog/infrastructure/repositories/TaxFeeRepository"
import { CatalogRestrictionRepository } from "../modules/catalog/infrastructure/repositories/CatalogRestrictionRepository"
import { CancellationPolicyRepository } from "../modules/catalog/infrastructure/repositories/CancellationPolicyRepository"
import { ProductServiceRepository } from "../modules/catalog/infrastructure/repositories/ProductServiceRepository"
import { ProductImageRepository } from "../modules/catalog/infrastructure/repositories/ProductImageRepository"
import { ImageUploadRepository } from "../modules/catalog/infrastructure/repositories/ImageUploadRepository"
import { VariantManagementRepository } from "../modules/catalog/infrastructure/repositories/VariantManagementRepository"
import { HotelAmenityQueryRepository } from "../modules/catalog/infrastructure/repositories/HotelAmenityQueryRepository"
import { HotelRoomTypeRepository } from "../modules/catalog/infrastructure/repositories/HotelRoomTypeRepository"
import { ImageQueryRepository } from "../modules/catalog/infrastructure/repositories/ImageQueryRepository"
import { ProductServiceQueryRepository } from "../modules/catalog/infrastructure/repositories/ProductServiceQueryRepository"
import { DestinationQueryRepository } from "../modules/catalog/infrastructure/repositories/DestinationQueryRepository"
import { MarketplaceHotelSearchRepository } from "../modules/catalog/infrastructure/repositories/MarketplaceHotelSearchRepository"

import {
	createResolveHotelAmenitiesQuery,
	createResolveHotelTypeQuery,
	createResolveProductImagesQuery,
	createResolveProductServicesQuery,
	createResolveRoomImagesQuery,
	createGetProductByIdQuery,
	createListProductServiceConfigsQuery,
	createGetProductServiceConfigQuery,
	createListActiveCancellationPoliciesQuery,
	createSearchDestinationsQuery,
	createListMarketplaceHotelsByDestinationQuery,
} from "../modules/catalog/application/queries"

// ---- Infrastructure singletons ----
export const subtypeRepository = new SubtypeRepository()
export const providerRepository = new ProviderRepository()
export const providerV2Repository = new ProviderV2Repository()
export const productRepository = new ProductRepository(r2)
export const taxFeeRepository = new TaxFeeRepository()
export const catalogRestrictionRepository = new CatalogRestrictionRepository()
export const cancellationPolicyRepository = new CancellationPolicyRepository()
export const productServiceRepository = new ProductServiceRepository()
export const productImageRepository = new ProductImageRepository()
export const imageUploadRepository = new ImageUploadRepository()
export const variantManagementRepository = new VariantManagementRepository()

export async function cleanupStaleUploads(params: { olderThanMinutes: number }) {
	if (!process.env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME is not defined")
	const { cleanupStaleUploads } = await import(
		"../modules/catalog/infrastructure/uploads/cleanupStaleUploads"
	)
	return cleanupStaleUploads({
		repo: imageUploadRepository,
		r2,
		bucket: process.env.R2_BUCKET_NAME,
		olderThanMinutes: params.olderThanMinutes,
	})
}

export const hotelAmenityQueryRepository = new HotelAmenityQueryRepository()
export const hotelRoomTypeRepository = new HotelRoomTypeRepository()
export const imageQueryRepository = new ImageQueryRepository()
export const productServiceQueryRepository = new ProductServiceQueryRepository()
export const destinationQueryRepository = new DestinationQueryRepository()
export const marketplaceHotelSearchRepository = new MarketplaceHotelSearchRepository()

// ---- Wired read queries ----
export const resolveHotelAmenities = createResolveHotelAmenitiesQuery({
	repo: hotelAmenityQueryRepository,
})
export const resolveHotelType = createResolveHotelTypeQuery({ repo: hotelRoomTypeRepository })
export const resolveProductImages = createResolveProductImagesQuery({
	repo: productImageRepository,
})
export const resolveProductServices = createResolveProductServicesQuery({
	repo: productServiceQueryRepository,
})
export const resolveRoomImages = createResolveRoomImagesQuery({ repo: imageQueryRepository })

export const getProductById = createGetProductByIdQuery({ repo: productRepository })
export const listProductServiceConfigs = createListProductServiceConfigsQuery({
	repo: productServiceQueryRepository,
})
export const getProductServiceConfig = createGetProductServiceConfigQuery({
	repo: productServiceQueryRepository,
})
export const listActiveCancellationPolicies = createListActiveCancellationPoliciesQuery({
	repo: cancellationPolicyRepository,
})

export const searchDestinations = createSearchDestinationsQuery({
	repo: destinationQueryRepository,
})

export const listMarketplaceHotelsByDestination = createListMarketplaceHotelsByDestinationQuery({
	repo: marketplaceHotelSearchRepository,
})
