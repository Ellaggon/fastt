import {
	first,
	and,
	asc,
	db,
	desc,
	eq,
	GeoPlace,
	Hotel,
	Image,
	inArray,
	Limousine,
	Package,
	Product,
	ProductContent,
	ProductGeoPlace,
	ProductImage,
	ProductLocation,
	Provider,
	ProviderProfile,
	ProviderUser,
	ProviderVerification,
	RatePlan,
	Tour,
	User,
	Variant,
	VariantCapacity,
	VariantRoomProfile,
	RoomType,
} from "@/shared/infrastructure/db/compat"

import { ensureObjectKey } from "@/lib/images/objectKey"
import type {
	CatalogReadModelRepositoryPort,
	VariantFullAggregate,
} from "@/modules/catalog/application/ports/CatalogReadModelRepositoryPort"
import { RatePlanPricingReadRepository } from "../../../pricing/infrastructure/repositories/RatePlanPricingReadRepository"

function toVariantLifecycleState(value: string | null | undefined): "draft" | "ready" | "archived" {
	return value === "ready" || value === "archived" ? value : "draft"
}

export class CatalogReadModelRepository implements CatalogReadModelRepositoryPort {
	private readonly pricingReadRepository = new RatePlanPricingReadRepository()

	async getProductAggregate(productId: string) {
		if (!productId) return null

		const rows = await db
			.select({
				id: Product.id,
				displayName: Product.name,
				productType: Product.productType,
				contentDescription: ProductContent.description,
				status: Product.publicationState,
				contentHighlights: ProductContent.highlightsJson,
				address: ProductLocation.address,
				lat: ProductLocation.lat,
				lng: ProductLocation.lng,
			})
			.from(Product)
			.leftJoin(ProductContent, eq(ProductContent.productId, Product.id))
			.leftJoin(ProductLocation, eq(ProductLocation.productId, Product.id))
			.where(eq(Product.id, productId))
			.limit(1)

		const row = rows[0]
		if (!row) return null

		const images = await db
			.select({
				id: Image.id,
				url: Image.url,
				objectKey: Image.objectKey,
				isPrimary: ProductImage.isPrimary,
				order: ProductImage.sortOrder,
			})
			.from(ProductImage)
			.innerJoin(Image, eq(Image.id, ProductImage.imageId))
			.where(eq(ProductImage.productId, productId))
			.orderBy(asc(ProductImage.sortOrder))

		const modernDescription = row.contentDescription ? String(row.contentDescription).trim() : null
		const description: string | null = modernDescription || null

		return {
			id: row.id,
			displayName: row.displayName,
			productType: row.productType,
			status: row.status || "draft",
			content: {
				description,
				highlights: row.contentHighlights ?? [],
			},
			location: {
				address: row.address ?? null,
				lat: row.lat ?? null,
				lng: row.lng ?? null,
			},
			images: images.map((image) => ({
				id: image.id,
				url: image.url,
				objectKey:
					ensureObjectKey({
						objectKey: image.objectKey ? String(image.objectKey) : null,
						url: String(image.url),
						context: "getProductAggregate",
						imageId: String(image.id),
					}) ?? "",
				isPrimary: Boolean(image.isPrimary),
				order: Number(image.order ?? 0),
			})),
		}
	}

	async getProductFullAggregate(productId: string, providerId: string) {
		if (!productId || !providerId) return null

		const row = await db
			.select({
				id: Product.id,
				displayName: Product.name,
				productType: Product.productType,
				status: Product.publicationState,
				geoPlaceId: GeoPlace.id,
				geoPlaceCanonicalName: GeoPlace.canonicalName,
				geoPlaceCanonicalPath: GeoPlace.canonicalPath,
				geoPlaceType: GeoPlace.placeType,
				geoPlaceCountryCode: GeoPlace.countryCode,
				contentDescription: ProductContent.description,
				contentHighlights: ProductContent.highlightsJson,
				address: ProductLocation.address,
				lat: ProductLocation.lat,
				lng: ProductLocation.lng,
				hotelStars: Hotel.stars,
				hotelPhone: Hotel.phone,
				hotelEmail: Hotel.email,
				tourDuration: Tour.duration,
				tourDurationMinutes: Tour.durationMinutes,
				tourDifficulty: Tour.difficultyLevel,
				tourMeetingPoint: Tour.meetingPointJson,
				tourItinerary: Tour.itineraryJson,
				tourSafety: Tour.safetyJson,
				tourGuide: Tour.guideJson,
				tourIncludes: Tour.includesJson,
				tourExcludes: Tour.excludesJson,
				tourCategories: Tour.categoriesJson,
				tourPickup: Tour.pickupJson,
				packageDays: Package.days,
				packageNights: Package.nights,
				packageItinerary: Package.itineraryJson,
				packageIncludes: Package.includesJson,
				packageExcludes: Package.excludesJson,
				limousineVehicle: Limousine.vehicleProfileJson,
				limousinePickup: Limousine.pickupJson,
				limousineDropoff: Limousine.dropoffJson,
				limousinePassengerCapacity: Limousine.passengerCapacity,
				limousineLuggageCapacity: Limousine.luggageCapacity,
			})
			.from(Product)
			.leftJoin(
				ProductGeoPlace,
				and(
					eq(ProductGeoPlace.productId, Product.id),
					eq(ProductGeoPlace.role, "primary_discovery"),
					eq(ProductGeoPlace.isPrimary, true)
				)
			)
			.leftJoin(GeoPlace, eq(GeoPlace.id, ProductGeoPlace.placeId))
			.leftJoin(ProductContent, eq(ProductContent.productId, Product.id))
			.leftJoin(ProductLocation, eq(ProductLocation.productId, Product.id))
			.leftJoin(Hotel, eq(Hotel.productId, Product.id))
			.leftJoin(Tour, eq(Tour.productId, Product.id))
			.leftJoin(Package, eq(Package.productId, Product.id))
			.leftJoin(Limousine, eq(Limousine.productId, Product.id))
			.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
			.then(first)

		if (!row) return null

		const images = await db
			.select({
				id: Image.id,
				url: Image.url,
				objectKey: Image.objectKey,
				isPrimary: ProductImage.isPrimary,
				order: ProductImage.sortOrder,
			})
			.from(ProductImage)
			.innerJoin(Image, eq(Image.id, ProductImage.imageId))
			.where(eq(ProductImage.productId, productId))
			.orderBy(asc(ProductImage.sortOrder))

		const normalizedType = String(row.productType ?? "")
			.trim()
			.toLowerCase()

		const subtype =
			normalizedType === "hotel"
				? {
						kind: "hotel" as const,
						stars: row.hotelStars ?? null,
						phone: row.hotelPhone ?? null,
						email: row.hotelEmail ?? null,
					}
				: normalizedType === "tour"
					? {
							kind: "tour" as const,
							duration: row.tourDuration ? String(row.tourDuration) : null,
							durationMinutes: row.tourDurationMinutes ?? null,
							difficultyLevel: row.tourDifficulty ? String(row.tourDifficulty) : null,
							meetingPoint: row.tourMeetingPoint ?? null,
							itinerary: row.tourItinerary ?? null,
							safety: row.tourSafety ?? null,
							guide: row.tourGuide ?? null,
							includes: row.tourIncludes ?? null,
							excludes: row.tourExcludes ?? null,
							categories: row.tourCategories ?? null,
							pickup: row.tourPickup ?? null,
						}
					: normalizedType === "package"
						? {
								kind: "package" as const,
								days: row.packageDays ?? null,
								nights: row.packageNights ?? null,
								itinerary: row.packageItinerary ?? null,
								includes: row.packageIncludes ?? null,
								excludes: row.packageExcludes ?? null,
							}
						: normalizedType === "limousine"
							? {
									kind: "limousine" as const,
									vehicleProfile: row.limousineVehicle ?? null,
									pickup: row.limousinePickup ?? null,
									dropoff: row.limousineDropoff ?? null,
									passengerCapacity: row.limousinePassengerCapacity ?? null,
									luggageCapacity: row.limousineLuggageCapacity ?? null,
								}
							: null

		return {
			id: row.id,
			displayName: row.displayName,
			productType: row.productType,
			status: row.status || "draft",
			geoPlace: row.geoPlaceId
				? {
						id: row.geoPlaceId,
						canonicalName: row.geoPlaceCanonicalName ?? row.geoPlaceId,
						canonicalPath: row.geoPlaceCanonicalPath ?? row.geoPlaceId,
						placeType: row.geoPlaceType ?? "",
						countryCode: row.geoPlaceCountryCode ?? "",
					}
				: null,
			content: {
				description: row.contentDescription ? String(row.contentDescription).trim() : null,
				highlights: row.contentHighlights ?? [],
			},
			location: {
				address: row.address ?? null,
				lat: row.lat ?? null,
				lng: row.lng ?? null,
			},
			images: images.map((image) => ({
				id: image.id,
				url: image.url,
				objectKey:
					ensureObjectKey({
						objectKey: image.objectKey ? String(image.objectKey) : null,
						url: String(image.url),
						context: "getProductFullAggregate",
						imageId: String(image.id),
					}) ?? "",
				isPrimary: Boolean(image.isPrimary),
				order: Number(image.order ?? 0),
			})),
			subtype,
		}
	}

	async getProductVariantsAggregate(productId: string, providerId: string) {
		if (!productId || !providerId) return null

		const rows = await db
			.select({
				productId: Product.id,
				displayName: Product.name,
				productStatus: Product.publicationState,
				variantId: Variant.id,
				variantName: Variant.name,
				variantKind: Variant.kind,
				variantLifecycleState: Variant.lifecycleState,
				variantSalesEnabled: Variant.salesEnabled,
				defaultRatePlanId: RatePlan.id,
				capVariantId: VariantCapacity.variantId,
				minOccupancy: VariantCapacity.minOccupancy,
				maxOccupancy: VariantCapacity.maxOccupancy,
				maxAdults: VariantCapacity.maxAdults,
				maxChildren: VariantCapacity.maxChildren,
				roomProfileVariantId: VariantRoomProfile.variantId,
				roomTypeId: VariantRoomProfile.roomTypeId,
				roomTypeName: RoomType.name,
			})
			.from(Product)
			.leftJoin(Variant, eq(Variant.productId, Product.id))
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.leftJoin(VariantRoomProfile, eq(VariantRoomProfile.variantId, Variant.id))
			.leftJoin(RoomType, eq(RoomType.id, VariantRoomProfile.roomTypeId))
			.leftJoin(
				RatePlan,
				and(
					eq(RatePlan.variantId, Variant.id),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))

		if (!rows.length) return null
		const defaultRatePlanIds = [
			...new Set(rows.map((row) => String(row.defaultRatePlanId ?? "").trim()).filter(Boolean)),
		]
		const pricingSummaries = defaultRatePlanIds.length
			? await this.pricingReadRepository.listRatePlanPricingSummaries(defaultRatePlanIds)
			: []
		const hasBaseRateByDefaultPlan = new Map(
			pricingSummaries.map((summary) => [String(summary.ratePlanId), true])
		)

		const first = rows[0]
		const variants = rows
			.filter((row) => Boolean(row.variantId))
			.map((row) => ({
				id: row.variantId as string,
				name: row.variantName as string,
				kind: row.variantKind ?? null,
				lifecycleState: toVariantLifecycleState(row.variantLifecycleState),
				salesEnabled: Boolean(row.variantSalesEnabled),
				defaultRatePlanId: row.defaultRatePlanId ? String(row.defaultRatePlanId) : null,
				pricing: {
					hasBaseRate: Boolean(
						hasBaseRateByDefaultPlan.get(String(row.defaultRatePlanId ?? "").trim())
					),
					hasDefaultRatePlan: Boolean(row.defaultRatePlanId),
				},
				capacity: row.capVariantId
					? {
							minOccupancy: row.minOccupancy ?? 0,
							maxOccupancy: row.maxOccupancy ?? 0,
							maxAdults: row.maxAdults ?? null,
							maxChildren: row.maxChildren ?? null,
						}
					: null,
				subtype:
					row.roomProfileVariantId && row.roomTypeId
						? { roomTypeId: row.roomTypeId, name: row.roomTypeName ?? null }
						: null,
			}))

		return {
			product: {
				id: first.productId,
				displayName: first.displayName,
				status: first.productStatus || "draft",
			},
			variants,
		}
	}

	async getVariantFullAggregate(
		productId: string,
		variantId: string,
		providerId: string
	): Promise<VariantFullAggregate | null> {
		if (!productId || !variantId || !providerId) return null

		const row = await db
			.select({
				variantId: Variant.id,
				variantProductId: Variant.productId,
				variantName: Variant.name,
				variantKind: Variant.kind,
				variantLifecycleState: Variant.lifecycleState,
				variantSalesEnabled: Variant.salesEnabled,
				capVariantId: VariantCapacity.variantId,
				minOccupancy: VariantCapacity.minOccupancy,
				maxOccupancy: VariantCapacity.maxOccupancy,
				maxAdults: VariantCapacity.maxAdults,
				maxChildren: VariantCapacity.maxChildren,
				roomProfileVariantId: VariantRoomProfile.variantId,
				roomTypeId: VariantRoomProfile.roomTypeId,
				roomTypeName: RoomType.name,
				defaultRatePlanId: RatePlan.id,
				lifecycleValidationErrors: Variant.lifecycleValidationErrorsJson,
				lifecycleEvaluatedAt: Variant.lifecycleEvaluatedAt,
			})
			.from(Variant)
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.leftJoin(VariantRoomProfile, eq(VariantRoomProfile.variantId, Variant.id))
			.leftJoin(RoomType, eq(RoomType.id, VariantRoomProfile.roomTypeId))
			.leftJoin(
				RatePlan,
				and(
					eq(RatePlan.variantId, Variant.id),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.where(
				and(
					eq(Variant.id, variantId),
					eq(Variant.productId, productId),
					eq(Product.providerId, providerId)
				)
			)
			.then(first)

		if (!row) return null
		const summary =
			row.defaultRatePlanId != null
				? await this.pricingReadRepository.getRatePlanPricingSummary(row.defaultRatePlanId)
				: null

		return {
			variant: {
				id: row.variantId,
				productId: row.variantProductId,
				name: row.variantName,
				kind: row.variantKind ?? null,
				lifecycleState: toVariantLifecycleState(row.variantLifecycleState),
				salesEnabled: Boolean(row.variantSalesEnabled),
				lifecycleValidationErrorsJson: row.lifecycleValidationErrors ?? null,
				lifecycleEvaluatedAt: row.lifecycleEvaluatedAt ?? null,
			},
			capacity: row.capVariantId
				? {
						minOccupancy: row.minOccupancy ?? 0,
						maxOccupancy: row.maxOccupancy ?? 0,
						maxAdults: row.maxAdults ?? null,
						maxChildren: row.maxChildren ?? null,
					}
				: null,
			subtype:
				row.roomProfileVariantId && row.roomTypeId
					? { roomTypeId: row.roomTypeId, name: row.roomTypeName ?? null }
					: null,
			baseRate:
				summary?.currency != null && summary?.basePrice != null
					? {
							currency: String(summary.currency),
							basePrice: Number(summary.basePrice),
						}
					: null,
			defaultRatePlan: row.defaultRatePlanId ? { ratePlanId: row.defaultRatePlanId } : null,
		}
	}

	async getProviderFullAggregate(providerId: string, currentUserId: string) {
		if (!providerId || !currentUserId) return null

		const rows = await db
			.select({
				provider: {
					id: Provider.id,
					displayName: Provider.displayName,
					legalName: Provider.legalName,
					status: Provider.status,
				},
				profile: {
					timezone: ProviderProfile.timezone,
					defaultCurrency: ProviderProfile.defaultCurrency,
					supportEmail: ProviderProfile.supportEmail,
					supportPhone: ProviderProfile.supportPhone,
				},
				providerUserRole: ProviderUser.role,
				providerUserUserId: ProviderUser.userId,
				ownerId: User.id,
				ownerEmail: User.email,
			})
			.from(Provider)
			.leftJoin(ProviderProfile, eq(ProviderProfile.providerId, Provider.id))
			.leftJoin(ProviderUser, eq(ProviderUser.providerId, Provider.id))
			.leftJoin(User, eq(User.id, ProviderUser.userId))
			.where(eq(Provider.id, providerId))

		if (!rows.length) return null

		const provider = rows[0].provider
		const rawProfile = rows[0].profile ?? null
		const profile = rawProfile
			? {
					timezone: rawProfile.timezone,
					defaultCurrency: rawProfile.defaultCurrency,
					supportEmail: rawProfile.supportEmail,
					supportPhone: rawProfile.supportPhone,
				}
			: null

		const ownerPreferred =
			rows.find((row) => row.providerUserRole === "owner" && row.ownerId) ??
			rows.find((row) => row.providerUserUserId === currentUserId && row.ownerId) ??
			null

		const ownerUser = ownerPreferred
			? {
					id: String(ownerPreferred.ownerId),
					email: String(ownerPreferred.ownerEmail),
				}
			: null

		const latestVerification =
			(await db
				.select({
					status: ProviderVerification.status,
					reason: ProviderVerification.reason,
					createdAt: ProviderVerification.createdAt,
				})
				.from(ProviderVerification)
				.where(eq(ProviderVerification.providerId, providerId))
				.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
				.then(first)) ?? null

		return {
			provider,
			profile,
			latestVerification,
			ownerUser,
		}
	}
}
