import {
	and,
	asc,
	Booking,
	BookingRoomDetail,
	db,
	desc,
	eq,
	Hotel,
	Image,
	inArray,
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
	RatePlanOccupancyPolicy,
	Tour,
	User,
	sql,
	Variant,
	VariantCapacity,
	VariantHotelRoom,
	VariantReadiness,
	RoomType,
} from "astro:db"

import { ensureObjectKey } from "@/lib/images/objectKey"
import type {
	CatalogReadModelRepositoryPort,
	VariantFullAggregate,
	ProviderBookingsAggregate,
	ProviderBookingsAggregateInput,
	ProviderBookingSummaryItem,
} from "@/modules/catalog/application/ports/CatalogReadModelRepositoryPort"

function toIso(value: unknown): string | null {
	if (!value) return null
	const date = value instanceof Date ? value : new Date(String(value))
	if (Number.isNaN(date.getTime())) return null
	return date.toISOString()
}

export class CatalogReadModelRepository implements CatalogReadModelRepositoryPort {
	async getProductAggregate(productId: string) {
		if (!productId) return null

		const rows = await db
			.select({
				id: Product.id,
				displayName: Product.name,
				productType: Product.productType,
				contentDescription: ProductContent.description,
				status: ProductStatus.state,
				contentRules: ProductContent.rules,
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
			.all()

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
			.all()

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
				rules: row.contentRules ? String(row.contentRules) : null,
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
				contentRules: ProductContent.rules,
				contentHighlights: ProductContent.highlightsJson,
				address: ProductLocation.address,
				lat: ProductLocation.lat,
				lng: ProductLocation.lng,
				hotelStars: Hotel.stars,
				hotelPhone: Hotel.phone,
				hotelEmail: Hotel.email,
				tourDuration: Tour.duration,
				tourDifficulty: Tour.difficultyLevel,
				tourLanguages: Tour.guideLanguages,
				packageDays: Package.days,
				packageNights: Package.nights,
			})
			.from(Product)
			.leftJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
			.leftJoin(ProductContent, eq(ProductContent.productId, Product.id))
			.leftJoin(ProductLocation, eq(ProductLocation.productId, Product.id))
			.leftJoin(Hotel, eq(Hotel.productId, Product.id))
			.leftJoin(Tour, eq(Tour.productId, Product.id))
			.leftJoin(Package, eq(Package.productId, Product.id))
			.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
			.get()

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
			.all()

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
							guideLanguages: row.tourLanguages ?? null,
						}
					: normalizedType === "package"
						? {
								kind: "package" as const,
								days: row.packageDays ?? null,
								nights: row.packageNights ?? null,
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
				rules: row.contentRules ? String(row.contentRules) : null,
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
				hotelRoomVariantId: VariantHotelRoom.variantId,
				roomTypeId: VariantHotelRoom.roomTypeId,
				roomTypeName: RoomType.name,
			})
			.from(Product)
			.leftJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
			.leftJoin(Variant, eq(Variant.productId, Product.id))
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.leftJoin(VariantHotelRoom, eq(VariantHotelRoom.variantId, Variant.id))
			.leftJoin(RoomType, eq(RoomType.id, VariantHotelRoom.roomTypeId))
			.leftJoin(
				RatePlan,
				and(
					eq(RatePlan.variantId, Variant.id),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
			.all()

		if (!rows.length) return null
		const defaultRatePlanIds = rows
			.map((row) => String(row.defaultRatePlanId ?? "").trim())
			.filter(Boolean)
		const plansWithPolicy = defaultRatePlanIds.length
			? await db
					.select({
						ratePlanId: RatePlanOccupancyPolicy.ratePlanId,
					})
					.from(RatePlanOccupancyPolicy)
					.where(inArray(RatePlanOccupancyPolicy.ratePlanId, defaultRatePlanIds))
					.groupBy(RatePlanOccupancyPolicy.ratePlanId)
					.all()
			: []
		const hasPolicyByRatePlan = new Set(plansWithPolicy.map((row) => String(row.ratePlanId)))

		const first = rows[0]
		const variants = rows
			.filter((row) => Boolean(row.variantId))
			.map((row) => ({
				id: row.variantId as string,
				name: row.variantName as string,
				kind: row.variantKind ?? null,
				status: row.variantStatus ?? null,
				pricing: {
					hasBaseRate: hasPolicyByRatePlan.has(String(row.defaultRatePlanId ?? "")),
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
					row.hotelRoomVariantId && row.roomTypeId
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
				hotelRoomVariantId: VariantHotelRoom.variantId,
				roomTypeId: VariantHotelRoom.roomTypeId,
				roomTypeName: RoomType.name,
				defaultRatePlanId: RatePlan.id,
				readinessState: VariantReadiness.state,
				readinessErrors: VariantReadiness.validationErrorsJson,
			})
			.from(Variant)
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.leftJoin(VariantHotelRoom, eq(VariantHotelRoom.variantId, Variant.id))
			.leftJoin(RoomType, eq(RoomType.id, VariantHotelRoom.roomTypeId))
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
			.get()

		if (!row) return null
		const baseRate =
			row.defaultRatePlanId != null
				? await db
						.select({
							baseRateCurrency: RatePlanOccupancyPolicy.baseCurrency,
							baseRatePrice: RatePlanOccupancyPolicy.baseAmount,
						})
						.from(RatePlanOccupancyPolicy)
						.where(eq(RatePlanOccupancyPolicy.ratePlanId, row.defaultRatePlanId))
						.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom))
						.get()
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
				row.hotelRoomVariantId && row.roomTypeId
					? { roomTypeId: row.roomTypeId, name: row.roomTypeName ?? null }
					: null,
			baseRate:
				baseRate?.baseRateCurrency != null && baseRate?.baseRatePrice != null
					? {
							currency: String(baseRate.baseRateCurrency),
							basePrice: Number(baseRate.baseRatePrice),
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
			.all()

		if (!rows.length) return null

		const provider = rows[0].provider
		const profile = rows[0].profile ?? null

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
				.get()) ?? null

		return {
			provider,
			profile,
			latestVerification,
			ownerUser,
		}
	}

	async getProviderBookingsAggregate(
		input: ProviderBookingsAggregateInput
	): Promise<ProviderBookingsAggregate> {
		const providerId = String(input.providerId ?? "").trim()
		if (!providerId) return { items: [] }

		const status = String(input.status ?? "all")
			.trim()
			.toLowerCase()
		const from = String(input.from ?? "").trim()
		const to = String(input.to ?? "").trim()

		const filters = [eq(Product.providerId, providerId)]
		if (status !== "all") {
			filters.push(eq(Booking.status, status))
		}
		if (from) {
			filters.push(sql`${Booking.checkInDate} >= ${from}`)
		}
		if (to) {
			filters.push(sql`${Booking.checkOutDate} <= ${to}`)
		}

		const rows = await db
			.select({
				bookingId: Booking.id,
				status: Booking.status,
				currency: Booking.currency,
				totalAmountUSD: Booking.totalAmountUSD,
				totalAmountBOB: Booking.totalAmountBOB,
				bookingDate: Booking.bookingDate,
				confirmedAt: Booking.confirmedAt,
				checkInDate: Booking.checkInDate,
				checkOutDate: Booking.checkOutDate,
				detailCheckIn: BookingRoomDetail.checkIn,
				detailCheckOut: BookingRoomDetail.checkOut,
				detailTotalPrice: BookingRoomDetail.totalPrice,
				detailVariantId: BookingRoomDetail.variantId,
				productId: Product.id,
				productName: Product.name,
				variantName: Variant.name,
			})
			.from(Booking)
			.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
			.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
			.leftJoin(Product, eq(Product.id, Variant.productId))
			.where(and(...filters))
			.orderBy(desc(Booking.bookingDate), desc(Booking.id))
			.all()

		const seen = new Set<string>()
		const items: ProviderBookingSummaryItem[] = []

		for (const row of rows) {
			if (seen.has(row.bookingId)) continue
			seen.add(row.bookingId)

			const currency = String(row.currency ?? "USD")
				.trim()
				.toUpperCase()
			const totalPrice =
				currency === "BOB"
					? Number(row.totalAmountBOB ?? row.detailTotalPrice ?? 0)
					: Number(row.totalAmountUSD ?? row.detailTotalPrice ?? 0)

			items.push({
				bookingId: row.bookingId,
				productId: row.productId ?? null,
				productName: row.productName ?? null,
				variantId: row.detailVariantId ?? null,
				variantName: row.variantName ?? null,
				checkIn: String(row.detailCheckIn ?? row.checkInDate ?? "").trim() || null,
				checkOut: String(row.detailCheckOut ?? row.checkOutDate ?? "").trim() || null,
				totalPrice,
				currency,
				status: String(row.status ?? "draft"),
				createdAt: toIso(row.bookingDate),
				confirmedAt: toIso(row.confirmedAt),
			})
		}

		return { items }
	}
}
