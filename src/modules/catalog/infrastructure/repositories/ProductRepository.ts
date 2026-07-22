import {
	first,
	db,
	and,
	eq,
	inArray,
	Product,
	ProductContent,
	ProductLocation,
	ProductPreparationSnapshot,
	ProductStatus,
	HouseRule,
	Image,
	ImageUpload,
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
	EffectiveRestriction,
	PolicyAssignment,
	ProductService,
	ProductServiceAttribute,
	RatePlan,
	SearchUnitView,
	TaxFeeAssignment,
} from "@/shared/infrastructure/db/compat"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import type {
	ProductAggregate,
	ProductRepositoryPort,
	ProductStatusState,
} from "../../application/ports/ProductRepositoryPort"
import type { RatePlanCommandRepositoryPort } from "../../../pricing/application/ports/RatePlanCommandRepositoryPort"
import { RatePlanCommandRepository } from "../../../pricing/infrastructure/repositories/RatePlanCommandRepository"

export class ProductRepository implements ProductRepositoryPort {
	constructor(
		private r2?: S3Client,
		private readonly ratePlanCommands: RatePlanCommandRepositoryPort = new RatePlanCommandRepository()
	) {}

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
			.then(first)
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
			.then(first)
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
			.then(first)

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
			.then(first)

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
			.then(first)

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
			.then(first)

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
			.then(first)

		const location = await db
			.select({
				productId: ProductLocation.productId,
				address: ProductLocation.address,
				lat: ProductLocation.lat,
				lng: ProductLocation.lng,
			})
			.from(ProductLocation)
			.where(eq(ProductLocation.productId, productId))
			.then(first)

		const status = await db
			.select({
				productId: ProductStatus.productId,
				state: ProductStatus.state,
				validationErrorsJson: ProductStatus.validationErrorsJson,
			})
			.from(ProductStatus)
			.where(eq(ProductStatus.productId, productId))
			.then(first)

		const images = await db
			.select({ id: Image.id })
			.from(Image)
			.where(eq(Image.entityId, productId))

		const pt = String(product.productType || "")
			.trim()
			.toLowerCase()
		let subtypeExists = false
		let verticalReadiness: ProductAggregate["verticalReadiness"] = {
			kind: "unknown",
			subtypeExists: false,
		}
		if (pt === "hotel") {
			subtypeExists = !!(await db
				.select()
				.from(Hotel)
				.where(eq(Hotel.productId, productId))
				.then(first))
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

			let completeRoomCount = 0
			for (const variant of variants) {
				const beds = await db
					.select({ id: VariantRoomBed.id })
					.from(VariantRoomBed)
					.where(eq(VariantRoomBed.variantId, variant.id))

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
			const tour = await db.select().from(Tour).where(eq(Tour.productId, productId)).then(first)
			subtypeExists = !!tour
			const schedules = await db
				.select({ id: Variant.id })
				.from(Variant)
				.where(and(eq(Variant.productId, productId), eq(Variant.kind, "tour_slot")))

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
			const pkg = await db
				.select()
				.from(Package)
				.where(eq(Package.productId, productId))
				.then(first)
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
			const limo = await db
				.select()
				.from(Limousine)
				.where(eq(Limousine.productId, productId))
				.then(first)
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
		const product = await db.select().from(Product).where(eq(Product.id, productId)).then(first)
		if (!product) return

		const variants = await db.select().from(Variant).where(eq(Variant.productId, productId))
		const variantIds = variants.map((variant) => String(variant.id))
		const ratePlans = variantIds.length
			? await db.select().from(RatePlan).where(inArray(RatePlan.variantId, variantIds))
			: []
		const ratePlanIds = ratePlans.map((ratePlan) => String(ratePlan.id))
		const serviceRows = await db
			.select()
			.from(ProductService)
			.where(eq(ProductService.productId, productId))

		const serviceIds = serviceRows.map((service) => String(service.id))
		const productImages = await db.select().from(Image).where(eq(Image.entityId, productId))
		const variantImages = variantIds.length
			? await db.select().from(Image).where(inArray(Image.entityId, variantIds))
			: []
		const productObjectPrefix = `products/${productId}/`
		const pendingProductImages = (await db.select().from(Image)).filter((image) =>
			String((image as any).objectKey ?? "").startsWith(productObjectPrefix)
		)
		const imagesById = new Map<string, (typeof productImages)[number]>()
		for (const image of [...productImages, ...variantImages, ...pendingProductImages]) {
			imagesById.set(String(image.id), image)
		}
		const images = [...imagesById.values()]
		const imageIds = images.map((image) => String(image.id))
		const imageObjectKeys = [
			...new Set(
				images
					.map((image) => String((image as any).objectKey ?? "").trim())
					.filter((objectKey) => objectKey.length > 0)
			),
		]

		if (imageIds.length) {
			await db.delete(ImageUpload).where(inArray(ImageUpload.imageId, imageIds))
		}
		if (imageObjectKeys.length) {
			await db.delete(ImageUpload).where(inArray(ImageUpload.objectKey, imageObjectKeys))
		}

		if (ratePlanIds.length) {
			for (const ratePlanId of ratePlanIds) {
				await this.ratePlanCommands.deleteRatePlan(ratePlanId)
			}
		}

		if (variantIds.length) {
			await this.ratePlanCommands.purgeEffectivePricingByVariantIds(variantIds)
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
		if (imageIds.length) {
			await db.delete(Image).where(inArray(Image.id, imageIds))
		}
		await db.delete(HouseRule).where(eq(HouseRule.productId, productId))
		await db.delete(ProductContent).where(eq(ProductContent.productId, productId))
		await db.delete(ProductLocation).where(eq(ProductLocation.productId, productId))
		const preparationSnapshot = ProductPreparationSnapshot as { productId?: unknown } | undefined
		if (preparationSnapshot?.productId) {
			await db
				.delete(ProductPreparationSnapshot)
				.where(eq(ProductPreparationSnapshot.productId, productId))
		}
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
