import {
	and,
	asc,
	db,
	eq,
	GeoPlace,
	ProductCategory,
	ProductCategoryLink,
	Tour,
} from "@/shared/infrastructure/db/compat"
import { isGeoPlaceCompatible } from "@/modules/catalog/public"
import { publicTourCategories } from "./tourDiscoveryFilters"

export async function loadTourPresentationForm(productId?: string) {
	const [places, categories, links, classification] = await Promise.all([
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
			.select()
			.from(ProductCategory)
			.where(and(eq(ProductCategory.vertical, "tour"), eq(ProductCategory.dataClass, "production")))
			.orderBy(asc(ProductCategory.sortOrder), asc(ProductCategory.name)),
		productId
			? db
					.select({
						categoryId: ProductCategoryLink.categoryId,
						assignmentKind: ProductCategoryLink.assignmentKind,
					})
					.from(ProductCategoryLink)
					.where(eq(ProductCategoryLink.productId, productId))
			: Promise.resolve([]),
		productId
			? db.select().from(Tour).where(eq(Tour.productId, productId)).limit(1)
			: Promise.resolve([]),
	])
	return {
		places: places.filter((place) =>
			isGeoPlaceCompatible({ productType: "tour", placeType: place.placeType })
		),
		categories: publicTourCategories(
			categories.filter((row) => row.isActive && row.classificationKind === "legacy")
		),
		activities: categories.filter((row) => row.classificationKind === "activity"),
		families: categories.filter((row) => row.classificationKind === "family"),
		classification: classification[0] ?? null,
		additionalThemeIds: links
			.filter((row) => row.assignmentKind === "additional_theme")
			.map((row) => row.categoryId),
		linkedIds: links.map((link) => link.categoryId),
	}
}
