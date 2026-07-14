import {
	db,
	and,
	eq,
	inArray,
	Product,
	ProductContent,
	ProductLocation,
	ProductStatus,
	HouseRule,
	Image,
	Hotel,
	Limousine,
	Tour,
	Package,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
	VariantReadiness,
	VariantRoomAmenity,
	VariantRoomBed,
	VariantRoomProfile,
	CommercialRuleApplication,
	DailyInventory,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	PolicyAssignment,
	ProductService,
	ProductServiceAttribute,
	RatePlan,
	RatePlanOccupancyPolicy,
	SearchUnitView,
	TaxFeeAssignment,
} from "astro:db"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import type {
	ProductAggregate,
	ProductRepositoryPort,
	ProductStatusState,
} from "../../application/ports/ProductRepositoryPort"

export class ProductRepository implements ProductRepositoryPort {
	constructor(private r2?: S3Client) {}

	// INVARIANT:
	// Product persists identity only.
	// Content, location and status are stored in their dedicated tables.
	async createProductBase(params: {
		id: string
		name: string
		productType: string
		providerId?: string | null
		destinationId: string
	}): Promise<void> {
		await db.insert(Product).values({
			id: params.id,
			name: params.name,
			productType: params.productType,
			providerId: params.providerId ?? null,
			destinationId: params.destinationId,
		})
	}

	async getProductById(productId: string) {
		if (!productId) return null
		const row = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				providerId: Product.providerId,
				destinationId: Product.destinationId,
			})
			.from(Product)
			.where(eq(Product.id, productId))
			.get()
		return row ?? null
	}

	async ensureProductOwnedByProvider(productId: string, providerId: string) {
		if (!productId || !providerId) return null
		const row = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				providerId: Product.providerId,
				destinationId: Product.destinationId,
			})
			.from(Product)
			.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
			.get()
		return row ?? null
	}

	async upsertProductContent(params: {
		productId: string
		description?: string | null
		highlightsJson?: unknown | null
		seoJson?: unknown | null
	}): Promise<void> {
		const existing = await db
			.select({ productId: ProductContent.productId })
			.from(ProductContent)
			.where(eq(ProductContent.productId, params.productId))
			.get()

		if (!existing) {
			await db.insert(ProductContent).values({
				productId: params.productId,
				description: params.description ?? null,
				highlightsJson: params.highlightsJson ?? null,
				seoJson: params.seoJson ?? null,
			})
			return
		}

		await db
			.update(ProductContent)
			.set({
				description: params.description ?? null,
				highlightsJson: params.highlightsJson ?? null,
				seoJson: params.seoJson ?? null,
			})
			.where(eq(ProductContent.productId, params.productId))
	}

	async upsertProductLocation(params: {
		productId: string
		address?: string | null
		lat?: number | null
		lng?: number | null
	}): Promise<void> {
		const existing = await db
			.select({ productId: ProductLocation.productId })
			.from(ProductLocation)
			.where(eq(ProductLocation.productId, params.productId))
			.get()

		if (!existing) {
			await db.insert(ProductLocation).values({
				productId: params.productId,
				address: params.address ?? null,
				lat: params.lat ?? null,
				lng: params.lng ?? null,
			})
			return
		}

		await db
			.update(ProductLocation)
			.set({
				address: params.address ?? null,
				lat: params.lat ?? null,
				lng: params.lng ?? null,
			})
			.where(eq(ProductLocation.productId, params.productId))
	}

	async upsertProductStatus(params: {
		productId: string
		state: "draft" | "ready" | "published"
		validationErrorsJson?: unknown | null
	}): Promise<void> {
		const existing = await db
			.select({ productId: ProductStatus.productId })
			.from(ProductStatus)
			.where(eq(ProductStatus.productId, params.productId))
			.get()

		if (!existing) {
			await db.insert(ProductStatus).values({
				productId: params.productId,
				state: params.state,
				validationErrorsJson: params.validationErrorsJson ?? null,
			})
			return
		}

		await db
			.update(ProductStatus)
			.set({
				state: params.state,
				validationErrorsJson: params.validationErrorsJson ?? null,
			})
			.where(eq(ProductStatus.productId, params.productId))
	}

	async getProductAggregate(productId: string): Promise<ProductAggregate | null> {
		const product = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				providerId: Product.providerId,
				destinationId: Product.destinationId,
			})
			.from(Product)
			.where(eq(Product.id, productId))
			.get()

		if (!product) return null

		const content = await db
			.select({
				productId: ProductContent.productId,
				description: ProductContent.description,
				highlightsJson: ProductContent.highlightsJson,
				seoJson: ProductContent.seoJson,
			})
			.from(ProductContent)
			.where(eq(ProductContent.productId, productId))
			.get()

		const location = await db
			.select({
				productId: ProductLocation.productId,
				address: ProductLocation.address,
				lat: ProductLocation.lat,
				lng: ProductLocation.lng,
			})
			.from(ProductLocation)
			.where(eq(ProductLocation.productId, productId))
			.get()

		const status = await db
			.select({
				productId: ProductStatus.productId,
				state: ProductStatus.state,
				validationErrorsJson: ProductStatus.validationErrorsJson,
			})
			.from(ProductStatus)
			.where(eq(ProductStatus.productId, productId))
			.get()

		const images = await db
			.select({ id: Image.id })
			.from(Image)
			.where(eq(Image.entityId, productId))
			.all()

		const pt = String(product.productType || "")
			.trim()
			.toLowerCase()
		let subtypeExists = false
		let verticalReadiness: ProductAggregate["verticalReadiness"] = {
			kind: "unknown",
			subtypeExists: false,
		}
		if (pt === "hotel") {
			subtypeExists = !!(await db.select().from(Hotel).where(eq(Hotel.productId, productId)).get())
			const variants = await db
				.select({
					id: Variant.id,
					profileVariantId: VariantRoomProfile.variantId,
					capacityVariantId: VariantCapacity.variantId,
				})
				.from(Variant)
				.leftJoin(VariantRoomProfile, eq(VariantRoomProfile.variantId, Variant.id))
				.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
				.where(and(eq(Variant.productId, productId), eq(Variant.kind, "hotel_room")))
				.all()
			let completeRoomCount = 0
			for (const variant of variants) {
				const beds = await db
					.select({ id: VariantRoomBed.id })
					.from(VariantRoomBed)
					.where(eq(VariantRoomBed.variantId, variant.id))
					.all()
				if (variant.profileVariantId && variant.capacityVariantId && beds.length > 0) {
					completeRoomCount += 1
				}
			}
			verticalReadiness = {
				kind: "hotel",
				subtypeExists,
				hotel: {
					variantCount: variants.length,
					completeRoomCount,
				},
			}
		} else if (pt === "tour") {
			const tour = await db.select().from(Tour).where(eq(Tour.productId, productId)).get()
			subtypeExists = !!tour
			const schedules = await db
				.select({ id: Variant.id })
				.from(Variant)
				.where(and(eq(Variant.productId, productId), eq(Variant.kind, "tour_slot")))
				.all()
			verticalReadiness = {
				kind: "tour",
				subtypeExists,
				tour: {
					hasItinerary: Array.isArray(tour?.itineraryJson) && tour.itineraryJson.length > 0,
					hasMeetingPoint: !!tour?.meetingPointJson,
					hasSchedule: schedules.length > 0,
				},
			}
		} else if (pt === "package") {
			const pkg = await db.select().from(Package).where(eq(Package.productId, productId)).get()
			subtypeExists = !!pkg
			verticalReadiness = {
				kind: "package",
				subtypeExists,
				package: {
					hasDaysAndNights:
						pkg?.days !== null &&
						pkg?.days !== undefined &&
						pkg?.nights !== null &&
						pkg?.nights !== undefined &&
						Number(pkg.days) > 0 &&
						Number(pkg.nights) >= 0,
					hasItinerary: Array.isArray(pkg?.itineraryJson) && pkg.itineraryJson.length > 0,
					hasInclusions: Array.isArray(pkg?.includesJson) && pkg.includesJson.length > 0,
				},
			}
		} else if (pt === "limousine") {
			const limo = await db.select().from(Limousine).where(eq(Limousine.productId, productId)).get()
			subtypeExists = !!limo
			verticalReadiness = {
				kind: "limousine",
				subtypeExists,
				limousine: {
					hasVehicle: !!limo?.vehicleProfileJson,
					hasPickupDropoff: !!limo?.pickupJson && !!limo?.dropoffJson,
					hasCapacity:
						Number(limo?.passengerCapacity ?? 0) > 0 && Number(limo?.luggageCapacity ?? -1) >= 0,
				},
			}
		}

		const rawState = status?.state ?? null
		const statusState: ProductStatusState | null =
			rawState === "draft" || rawState === "ready" || rawState === "published" ? rawState : null

		return {
			product,
			imagesCount: images.length,
			subtypeExists,
			content: content ?? null,
			location: location ?? null,
			status:
				status && statusState
					? {
							productId: status.productId,
							state: statusState,
							validationErrorsJson: status.validationErrorsJson ?? null,
						}
					: null,
			verticalReadiness,
		}
	}

	async deleteProductCascade(productId: string) {
		if (!productId) return
		const product = await db.select().from(Product).where(eq(Product.id, productId)).get()
		if (!product) return

		const variants = await db.select().from(Variant).where(eq(Variant.productId, productId)).all()
		const variantIds = variants.map((variant) => String(variant.id))
		const ratePlans = variantIds.length
			? await db.select().from(RatePlan).where(inArray(RatePlan.variantId, variantIds)).all()
			: []
		const ratePlanIds = ratePlans.map((ratePlan) => String(ratePlan.id))
		const serviceRows = await db
			.select()
			.from(ProductService)
			.where(eq(ProductService.productId, productId))
			.all()
		const serviceIds = serviceRows.map((service) => String(service.id))
		const productImages = await db.select().from(Image).where(eq(Image.entityId, productId)).all()
		const variantImages = variantIds.length
			? await db.select().from(Image).where(inArray(Image.entityId, variantIds)).all()
			: []
		const images = [...productImages, ...variantImages]

		if (ratePlanIds.length) {
			await db
				.delete(CommercialRuleApplication)
				.where(
					and(
						eq(CommercialRuleApplication.scope, "rate_plan"),
						inArray(CommercialRuleApplication.scopeId, ratePlanIds)
					)
				)
			await db
				.delete(TaxFeeAssignment)
				.where(
					and(
						eq(TaxFeeAssignment.scope, "rate_plan"),
						inArray(TaxFeeAssignment.scopeId, ratePlanIds)
					)
				)
			await db
				.delete(PolicyAssignment)
				.where(
					and(
						eq(PolicyAssignment.scope, "rate_plan"),
						inArray(PolicyAssignment.scopeId, ratePlanIds)
					)
				)
			await db.delete(EffectivePricingV2).where(inArray(EffectivePricingV2.ratePlanId, ratePlanIds))
			await db
				.delete(EffectiveRestriction)
				.where(inArray(EffectiveRestriction.ratePlanId, ratePlanIds))
			await db
				.delete(RatePlanOccupancyPolicy)
				.where(inArray(RatePlanOccupancyPolicy.ratePlanId, ratePlanIds))
			await db.delete(RatePlan).where(inArray(RatePlan.id, ratePlanIds))
		}

		if (variantIds.length) {
			await db
				.delete(CommercialRuleApplication)
				.where(
					and(
						eq(CommercialRuleApplication.scope, "variant"),
						inArray(CommercialRuleApplication.scopeId, variantIds)
					)
				)
			await db
				.delete(TaxFeeAssignment)
				.where(
					and(eq(TaxFeeAssignment.scope, "variant"), inArray(TaxFeeAssignment.scopeId, variantIds))
				)
			await db
				.delete(PolicyAssignment)
				.where(
					and(eq(PolicyAssignment.scope, "variant"), inArray(PolicyAssignment.scopeId, variantIds))
				)
			await db.delete(Image).where(inArray(Image.entityId, variantIds))
			await db.delete(SearchUnitView).where(inArray(SearchUnitView.variantId, variantIds))
			await db.delete(EffectivePricingV2).where(inArray(EffectivePricingV2.variantId, variantIds))
			await db
				.delete(EffectiveRestriction)
				.where(inArray(EffectiveRestriction.variantId, variantIds))
			await db
				.delete(EffectiveAvailability)
				.where(inArray(EffectiveAvailability.variantId, variantIds))
			await db.delete(DailyInventory).where(inArray(DailyInventory.variantId, variantIds))
			await db
				.delete(VariantInventoryConfig)
				.where(inArray(VariantInventoryConfig.variantId, variantIds))
			await db.delete(VariantRoomAmenity).where(inArray(VariantRoomAmenity.variantId, variantIds))
			await db.delete(VariantRoomBed).where(inArray(VariantRoomBed.variantId, variantIds))
			await db.delete(VariantRoomProfile).where(inArray(VariantRoomProfile.variantId, variantIds))
			await db.delete(VariantCapacity).where(inArray(VariantCapacity.variantId, variantIds))
			await db.delete(VariantReadiness).where(inArray(VariantReadiness.variantId, variantIds))
			await db.delete(Variant).where(inArray(Variant.id, variantIds))
		}

		if (serviceIds.length) {
			await db
				.delete(ProductServiceAttribute)
				.where(inArray(ProductServiceAttribute.productServiceId, serviceIds))
			await db.delete(ProductService).where(inArray(ProductService.id, serviceIds))
		}

		await db
			.delete(CommercialRuleApplication)
			.where(
				and(
					eq(CommercialRuleApplication.scope, "product"),
					eq(CommercialRuleApplication.scopeId, productId)
				)
			)
		await db
			.delete(TaxFeeAssignment)
			.where(and(eq(TaxFeeAssignment.scope, "product"), eq(TaxFeeAssignment.scopeId, productId)))
		await db
			.delete(PolicyAssignment)
			.where(and(eq(PolicyAssignment.scope, "product"), eq(PolicyAssignment.scopeId, productId)))

		await db.delete(Image).where(eq(Image.entityId, productId))
		await db.delete(HouseRule).where(eq(HouseRule.productId, productId))
		await db.delete(ProductContent).where(eq(ProductContent.productId, productId))
		await db.delete(ProductLocation).where(eq(ProductLocation.productId, productId))
		await db.delete(ProductStatus).where(eq(ProductStatus.productId, productId))

		const pt = String(product.productType || "").toLowerCase()
		if (pt === "hotel") {
			await db.delete(Hotel).where(eq(Hotel.productId, productId))
		} else if (pt === "tour") {
			await db.delete(Tour).where(eq(Tour.productId, productId))
		} else if (pt === "package") {
			await db.delete(Package).where(eq(Package.productId, productId))
		} else if (pt === "limousine") {
			await db.delete(Limousine).where(eq(Limousine.productId, productId))
		}

		await db.delete(Product).where(eq(Product.id, productId))

		if (!this.r2 || !process.env.R2_BUCKET_NAME) return
		for (const img of images) {
			try {
				const objectKey = (img as any).objectKey ? String((img as any).objectKey) : null
				const key = objectKey || (img?.url ? new URL(img.url).pathname.replace(/^\/+/, "") : null)
				if (!key) continue
				await this.r2.send(
					new DeleteObjectCommand({
						Bucket: process.env.R2_BUCKET_NAME,
						Key: key,
					})
				)
			} catch (error) {
				console.warn("Failed to delete product image from R2", error)
			}
		}
	}
}
