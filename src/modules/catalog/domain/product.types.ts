import type { ProductImageRow } from "../application/ports/ProductImageRepositoryPort"

export type ProductRow = {
	id: string
	name: string | null
	description?: string | null
	productType: string | null
	providerId: string | null
	geoPlaceId?: string | null
}

export type ProductBundle = {
	product: ProductRow
	images: ProductImageRow[]
	subtype: unknown | null
}
