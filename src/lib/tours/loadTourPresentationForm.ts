import {
	and,
	asc,
	db,
	eq,
	GeoPlace,
	ProductCategory,
	ProductCategoryLink,
} from "@/shared/infrastructure/db/compat"
import { isGeoPlaceCompatible } from "@/modules/catalog/public"
import { publicTourCategories } from "./tourDiscoveryFilters"

export async function loadTourPresentationForm(productId?: string) {
	const [places, categories, links] = await Promise.all([
		db
			.select({
				id: GeoPlace.id,
				name: GeoPlace.canonicalName,
				country: GeoPlace.countryCode,
				placeType: GeoPlace.placeType,
			})
			.from(GeoPlace)
			.where(eq(GeoPlace.status, "active"))
			.orderBy(asc(GeoPlace.canonicalName)),
		db
			.select({ id: ProductCategory.id, name: ProductCategory.name, slug: ProductCategory.slug })
			.from(ProductCategory)
			.where(
				and(
					eq(ProductCategory.vertical, "tour"),
					eq(ProductCategory.isActive, true),
					eq(ProductCategory.dataClass, "production")
				)
			)
			.orderBy(asc(ProductCategory.sortOrder), asc(ProductCategory.name)),
		productId
			? db
					.select({ categoryId: ProductCategoryLink.categoryId })
					.from(ProductCategoryLink)
					.where(eq(ProductCategoryLink.productId, productId))
			: Promise.resolve([]),
	])
	return {
		places: places.filter((place) =>
			isGeoPlaceCompatible({ productType: "tour", placeType: place.placeType })
		),
		categories: publicTourCategories(categories),
		linkedIds: links.map((link) => link.categoryId),
	}
}
