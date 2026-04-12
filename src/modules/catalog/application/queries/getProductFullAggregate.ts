import {
	and,
	asc,
	db,
	eq,
	Hotel,
	Image,
	Package,
	PricingBaseRate,
	Product,
	ProductContent,
	ProductLocation,
	ProductStatus,
	RatePlan,
	Tour,
	Variant,
	VariantCapacity,
	VariantHotelRoom,
	VariantReadiness,
	RoomType,
	inArray,
} from "astro:db"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
import { ensureObjectKey } from "@/lib/images/objectKey"

export type ProductFullAggregate = {
	id: string
	displayName: string
	productType: string
	status: string
	content: {
		description: string | null
		highlights: unknown
		rules: string | null
	}
	location: {
		address: string | null
		lat: number | null
		lng: number | null
	}
	images: Array<{
		id: string
		url: string
		objectKey: string
		isPrimary: boolean
		order: number
	}>
	subtype:
		| {
				kind: "hotel"
				stars: number | null
				phone: string | null
				email: string | null
		  }
		| {
				kind: "tour"
				duration: string | null
				difficultyLevel: string | null
				guideLanguages: unknown
		  }
		| {
				kind: "package"
				days: number | null
				nights: number | null
		  }
		| null
}

export type ProductVariantsAggregate = {
	product: {
		id: string
		displayName: string
		status: string
	}
	variants: Array<{
		id: string
		name: string
		kind: string | null
		status: string | null
		pricing: { hasBaseRate: boolean; hasDefaultRatePlan: boolean }
		capacity: {
			minOccupancy: number
			maxOccupancy: number
			maxAdults: number | null
			maxChildren: number | null
		} | null
		subtype: { roomTypeId: string; name: string | null } | null
	}>
}

export async function getProductFullAggregate(
	productId: string,
	providerId: string
): Promise<ProductFullAggregate | null> {
	if (!productId || !providerId) return null
	return readThrough(cacheKeys.productSurface(productId), cacheTtls.productSurface, async () => {
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
	})
}

export async function getProductVariantsAggregate(
	productId: string,
	providerId: string
): Promise<ProductVariantsAggregate | null> {
	if (!productId || !providerId) return null
	return readThrough(
		cacheKeys.productVariantsList(productId),
		cacheTtls.productVariantsList,
		async () => {
			const rows = await db
				.select({
					productId: Product.id,
					displayName: Product.name,
					productStatus: ProductStatus.state,
					variantId: Variant.id,
					variantName: Variant.name,
					variantKind: Variant.kind,
					variantStatus: Variant.status,
					baseRateVariantId: PricingBaseRate.variantId,
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
				.leftJoin(PricingBaseRate, eq(PricingBaseRate.variantId, Variant.id))
				.leftJoin(RatePlan, and(eq(RatePlan.variantId, Variant.id), eq(RatePlan.isDefault, true)))
				.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
				.all()

			if (!rows.length) return null

			const first = rows[0]
			const variants = rows
				.filter((row) => Boolean(row.variantId))
				.map((row) => ({
					id: row.variantId as string,
					name: row.variantName as string,
					kind: row.variantKind ?? null,
					status: row.variantStatus ?? null,
					pricing: {
						hasBaseRate: Boolean(row.baseRateVariantId),
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
	)
}

export type VariantFullAggregate = {
	variant: {
		id: string
		productId: string
		name: string
		kind: string | null
		status: string | null
	}
	capacity: {
		minOccupancy: number
		maxOccupancy: number
		maxAdults: number | null
		maxChildren: number | null
	} | null
	subtype: { roomTypeId: string; name: string | null } | null
	baseRate: { currency: string; basePrice: number } | null
	defaultRatePlan: { ratePlanId: string } | null
	readiness: { state: "draft" | "ready"; validationErrorsJson: unknown | null } | null
}

export async function getVariantFullAggregate(
	productId: string,
	variantId: string,
	providerId: string
): Promise<VariantFullAggregate | null> {
	if (!productId || !variantId || !providerId) return null
	return readThrough(cacheKeys.variantDetail(variantId), cacheTtls.variantDetail, async () => {
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
				baseRateCurrency: PricingBaseRate.currency,
				baseRatePrice: PricingBaseRate.basePrice,
				defaultRatePlanId: RatePlan.id,
				readinessState: VariantReadiness.state,
				readinessErrors: VariantReadiness.validationErrorsJson,
			})
			.from(Variant)
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.leftJoin(VariantHotelRoom, eq(VariantHotelRoom.variantId, Variant.id))
			.leftJoin(RoomType, eq(RoomType.id, VariantHotelRoom.roomTypeId))
			.leftJoin(PricingBaseRate, eq(PricingBaseRate.variantId, Variant.id))
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
				row.baseRateCurrency != null && row.baseRatePrice != null
					? { currency: String(row.baseRateCurrency), basePrice: Number(row.baseRatePrice) }
					: null,
			defaultRatePlan: row.defaultRatePlanId ? { ratePlanId: row.defaultRatePlanId } : null,
			readiness: row.readinessState
				? {
						state: row.readinessState === "ready" ? "ready" : "draft",
						validationErrorsJson: row.readinessErrors ?? null,
					}
				: null,
		}
	})
}
