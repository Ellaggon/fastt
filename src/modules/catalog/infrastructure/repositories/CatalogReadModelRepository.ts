import {
	first,
	and,
	asc,
	db,
	desc,
	eq,
	Hotel,
	Image,
	inArray,
	Limousine,
	Package,
	Product,
	ProductContent,
	ProductLocation,
	ProductStatus,
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
	VariantReadiness,
	RoomType,
} from "@/shared/infrastructure/db/compat"

import { ensureObjectKey } from "@/lib/images/objectKey"
import type {
	CatalogReadModelRepositoryPort,
	VariantFullAggregate,
} from "@/modules/catalog/application/ports/CatalogReadModelRepositoryPort"
import { RatePlanPricingReadRepository } from "../../../pricing/infrastructure/repositories/RatePlanPricingReadRepository"
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
				status: ProductStatus.state,
				contentHighlights: ProductContent.highlightsJson,
				address: ProductLocation.address,
				lat: ProductLocation.lat,
				lng: ProductLocation.lng,
			})
			.from(Product)
			.leftJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
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
				isPrimary: Image.isPrimary,
				order: Image.order,
			})
			.from(Image)
			.where(and(eq(Image.entityId, productId), inArray(Image.entityType, ["product", "Product"])))
			.orderBy(asc(Image.order))

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
				status: ProductStatus.state,
				contentDescription: ProductContent.description,
				contentHighlights: ProductContent.highlightsJson,
				address: ProductLocation.address,
				lat: ProductLocation.lat,
				lng: ProductLocation.lng,
				hotelStars: Hotel.stars,
				hotelPhone: Hotel.phone,
				hotelEmail: Hotel.email,
				tourDuration: Tour.duration,
				tourDifficulty: Tour.difficultyLevel,
				tourMeetingPoint: Tour.meetingPointJson,
				tourItinerary: Tour.itineraryJson,
				tourSafety: Tour.safetyJson,
				tourGuide: Tour.guideJson,
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
			.leftJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
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
				isPrimary: Image.isPrimary,
				order: Image.order,
			})
			.from(Image)
			.where(and(eq(Image.entityId, productId), inArray(Image.entityType, ["product", "Product"])))
			.orderBy(asc(Image.order))

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
							difficultyLevel: row.tourDifficulty ? String(row.tourDifficulty) : null,
							meetingPoint: row.tourMeetingPoint ?? null,
							itinerary: row.tourItinerary ?? null,
							safety: row.tourSafety ?? null,
							guide: row.tourGuide ?? null,
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
				productStatus: ProductStatus.state,
				variantId: Variant.id,
				variantName: Variant.name,
				variantKind: Variant.kind,
				variantStatus: Variant.status,
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
			.leftJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
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
		const hasBaseRateByDefaultPlan = new Map<string, boolean>()
		for (const row of rows) {
			const defaultRatePlanId = String(row.defaultRatePlanId ?? "").trim()
			if (!defaultRatePlanId || hasBaseRateByDefaultPlan.has(defaultRatePlanId)) continue
			const summary = await this.pricingReadRepository.getRatePlanPricingSummary(defaultRatePlanId)
			hasBaseRateByDefaultPlan.set(defaultRatePlanId, summary != null)
		}

		const first = rows[0]
		const variants = rows
			.filter((row) => Boolean(row.variantId))
			.map((row) => ({
				id: row.variantId as string,
				name: row.variantName as string,
				kind: row.variantKind ?? null,
				status: row.variantStatus ?? null,
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
				variantStatus: Variant.status,
				capVariantId: VariantCapacity.variantId,
				minOccupancy: VariantCapacity.minOccupancy,
				maxOccupancy: VariantCapacity.maxOccupancy,
				maxAdults: VariantCapacity.maxAdults,
				maxChildren: VariantCapacity.maxChildren,
				roomProfileVariantId: VariantRoomProfile.variantId,
				roomTypeId: VariantRoomProfile.roomTypeId,
				roomTypeName: RoomType.name,
				defaultRatePlanId: RatePlan.id,
				readinessState: VariantReadiness.state,
				readinessErrors: VariantReadiness.validationErrorsJson,
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
			.leftJoin(VariantReadiness, eq(VariantReadiness.variantId, Variant.id))
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

		const readiness =
			row.readinessState != null
				? {
						state: (row.readinessState === "ready" ? "ready" : "draft") as "ready" | "draft",
						validationErrorsJson: row.readinessErrors ?? null,
					}
				: null

		return {
			variant: {
				id: row.variantId,
				productId: row.variantProductId,
				name: row.variantName,
				kind: row.variantKind ?? null,
				status: row.variantStatus ?? null,
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
			readiness,
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
