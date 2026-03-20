import { createProduct, createRoom } from "@/modules/catalog/public"

import { r2 } from "./shared.container"
import { inventoryBootstrapper } from "./inventory.container"

import { RoomRepository } from "../modules/catalog/infrastructure/repositories/RoomRepository"
import { ProductRepository } from "../modules/catalog/infrastructure/repositories/ProductRepository"
import { SubtypeRepository } from "../modules/catalog/infrastructure/repositories/SubtypeRepository"
import { ProviderRepository } from "../modules/catalog/infrastructure/repositories/ProviderRepository"
import { HotelRoomRepository } from "../modules/catalog/infrastructure/repositories/HotelRoomRepository"
import { TaxFeeRepository } from "../modules/catalog/infrastructure/repositories/TaxFeeRepository"
import { CatalogRestrictionRepository } from "../modules/catalog/infrastructure/repositories/CatalogRestrictionRepository"
import { CancellationPolicyRepository } from "../modules/catalog/infrastructure/repositories/CancellationPolicyRepository"
import { ProductServiceRepository } from "../modules/catalog/infrastructure/repositories/ProductServiceRepository"
import { ProductImageRepository } from "../modules/catalog/infrastructure/repositories/ProductImageRepository"
import { HotelAmenityQueryRepository } from "../modules/catalog/infrastructure/repositories/HotelAmenityQueryRepository"
import { HotelRoomTypeRepository } from "../modules/catalog/infrastructure/repositories/HotelRoomTypeRepository"
import { ImageQueryRepository } from "../modules/catalog/infrastructure/repositories/ImageQueryRepository"
import { ProductServiceQueryRepository } from "../modules/catalog/infrastructure/repositories/ProductServiceQueryRepository"

import {
	createResolveHotelAmenitiesQuery,
	createResolveHotelTypeQuery,
	createResolveProductImagesQuery,
	createResolveProductServicesQuery,
	createResolveRoomImagesQuery,
} from "../modules/catalog/application/queries"

// ---- Infrastructure singletons ----
export const roomRepository = new RoomRepository()
export const productRepository = new ProductRepository(r2)
export const subtypeRepository = new SubtypeRepository()
export const providerRepository = new ProviderRepository()
export const hotelRoomRepository = new HotelRoomRepository(r2)
export const taxFeeRepository = new TaxFeeRepository()
export const catalogRestrictionRepository = new CatalogRestrictionRepository()
export const cancellationPolicyRepository = new CancellationPolicyRepository()
export const productServiceRepository = new ProductServiceRepository()
export const productImageRepository = new ProductImageRepository()

export const hotelAmenityQueryRepository = new HotelAmenityQueryRepository()
export const hotelRoomTypeRepository = new HotelRoomTypeRepository()
export const imageQueryRepository = new ImageQueryRepository()
export const productServiceQueryRepository = new ProductServiceQueryRepository()

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

// ---- Wired use-cases ----
export async function createRoomUseCase(params: Parameters<typeof createRoom>[1]) {
	return createRoom({ roomRepo: roomRepository, inventoryBootstrap: inventoryBootstrapper }, params)
}

export async function createProductUseCase(params: Parameters<typeof createProduct>[1]) {
	return createProduct({ repo: productRepository }, params)
}
