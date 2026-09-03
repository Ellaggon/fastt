import {
	first,
	db,
	and,
	eq,
	inArray,
	Product,
	ProductGeoPlace,
	ProductGeoPlaceActivity,
	GeoPlace,
	ProductContent,
	ProductLocation,
	ProductOperationalSurface,
	HouseRule,
	Image,
	ImageUpload,
	ProductImage,
	VariantImage,
	Hotel,
	Limousine,
	Tour,
	TourSlotProfile,
	TourTicketType,
	ProductCategoryLink,
	Package,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
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
	ProviderExternalCalendar,
	ProviderExternalCalendarEvent,
	ProviderIntegrationMapping,
	Provider,
} from "@/shared/infrastructure/db/compat"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import type {
	ProductAggregate,
	ProductRepositoryPort,
	ProductPublicationState,
} from "../../application/ports/ProductRepositoryPort"
import { tourHasMeetingPoint } from "@/lib/tours/tourAdminQuality"
import type { RatePlanCommandRepositoryPort } from "../../../pricing/application/ports/RatePlanCommandRepositoryPort"
import { RatePlanCommandRepository } from "../../../pricing/infrastructure/repositories/RatePlanCommandRepository"
import { normalizeProductTypeForStorage } from "@/lib/catalog/productVerticalRegistry"
import { geoPlaceCompatibilityError } from "../../domain/geo-place-compatibility"

export class ProductRepository implements ProductRepositoryPort {
	constructor(
		private r2?: S3Client,
		private readonly ratePlanCommands: RatePlanCommandRepositoryPort = new RatePlanCommandRepository()
	) {}

	private async assertCompatiblePrimaryGeoPlace(productType: string, geoPlaceId: string) {
		const place = await db
			.select({ status: GeoPlace.status, placeType: GeoPlace.placeType })
			.from(GeoPlace)
			.where(eq(GeoPlace.id, geoPlaceId))
			.then(first)
		if (!place || place.status !== "active") throw new Error("GEO_PLACE_NOT_ACTIVE")
		const error = geoPlaceCompatibilityError({ productType, placeType: place.placeType })
		if (error) throw new Error(`GEO_PLACE_INCOMPATIBLE:${error}`)
	}

	// INVARIANT:
	// Product owns identity and publication lifecycle. Content and location remain dedicated aggregates.
	async createProductBase(params: {
		id: string
		name: string
		productType: string
		providerId: string
		geoPlaceId: string
		dataClass?: "production" | "demo" | "fixture" | "sandbox"
	}): Promise<void> {
		const productType = normalizeProductTypeForStorage(params.productType)
		if (!productType) throw new Error("Unsupported product type")
		if (!String(params.providerId || "").trim()) throw new Error("PRODUCT_PROVIDER_REQUIRED")
		await this.assertCompatiblePrimaryGeoPlace(productType, params.geoPlaceId)
		await db.transaction(async (tx) => {
			await tx.insert(Product).values({
				id: params.id,
				name: params.name,
				productType,
				providerId: params.providerId,
				dataClass: params.dataClass ?? "production",
			})

			await tx.insert(ProductGeoPlace).values({
				id: `geo:product-place:${params.id}`,
				productId: params.id,
				placeId: params.geoPlaceId,
				role: "primary_discovery",
				isPrimary: true,
				source: "product_create",
			})
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
				geoPlaceId: ProductGeoPlace.placeId,
				dataClass: Product.dataClass,
			})
			.from(Product)
			.innerJoin(
				ProductGeoPlace,
				and(
					eq(ProductGeoPlace.productId, Product.id),
					eq(ProductGeoPlace.role, "primary_discovery"),
					eq(ProductGeoPlace.isPrimary, true)
				)
			)
			.where(eq(Product.id, productId))
			.then(first)
		return row ?? null
	}

	async getProductPublicationEligibility(productId: string) {
		const row = await db
			.select({
				productId: Product.id,
				productDataClass: Product.dataClass,
				providerId: Provider.id,
				providerAccountPurpose: Provider.accountPurpose,
				providerDataClassification: Provider.dataClassification,
			})
			.from(Product)
			.leftJoin(Provider, eq(Provider.id, Product.providerId))
			.where(eq(Product.id, productId))
			.then(first)

		if (!row) return { eligible: false, reason: "missing_product" as const }
		if (!row.providerId) return { eligible: false, reason: "missing_provider" as const }
		if (row.productDataClass !== "production" || row.providerDataClassification !== "production") {
			return { eligible: false, reason: "not_production" as const }
		}
		if (row.providerAccountPurpose !== "commercial") {
			return { eligible: false, reason: "provider_not_commercial" as const }
		}
		return { eligible: true, reason: null }
	}

	async ensureProductOwnedByProvider(productId: string, providerId: string) {
		if (!productId || !providerId) return null
		const row = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				providerId: Product.providerId,
				geoPlaceId: ProductGeoPlace.placeId,
				dataClass: Product.dataClass,
			})
			.from(Product)
			.innerJoin(
				ProductGeoPlace,
				and(
					eq(ProductGeoPlace.productId, Product.id),
					eq(ProductGeoPlace.role, "primary_discovery"),
					eq(ProductGeoPlace.isPrimary, true)
				)
			)
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
		const [existing, product] = await Promise.all([
			db
				.select({ productId: ProductContent.productId })
				.from(ProductContent)
				.where(eq(ProductContent.productId, params.productId))
				.then(first),
			db
				.select({ dataClass: Product.dataClass })
				.from(Product)
				.where(eq(Product.id, params.productId))
				.then(first),
		])
		if (!product) throw new Error("PRODUCT_NOT_FOUND")

		if (!existing) {
			await db.insert(ProductContent).values({
				productId: params.productId,
				description: params.description ?? null,
				highlightsJson: params.highlightsJson ?? null,
				seoJson: params.seoJson ?? null,
				dataClass: product.dataClass,
			})
			return
		}

		await db
			.update(ProductContent)
			.set({
				description: params.description ?? null,
				highlightsJson: params.highlightsJson ?? null,
				seoJson: params.seoJson ?? null,
				dataClass: product.dataClass,
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

	async setProductGeoPlace(params: {
		productId: string
		geoPlaceId: string
		actorId?: string | null
		source: string
	}): Promise<void> {
		const product = await db
			.select({ productType: Product.productType })
			.from(Product)
			.where(eq(Product.id, params.productId))
			.then(first)
		if (!product) throw new Error("PRODUCT_NOT_FOUND")
		await this.assertCompatiblePrimaryGeoPlace(product.productType, params.geoPlaceId)
		await db.transaction(async (tx) => {
			const current = await tx
				.select({ id: ProductGeoPlace.id, placeId: ProductGeoPlace.placeId })
				.from(ProductGeoPlace)
				.where(
					and(
						eq(ProductGeoPlace.productId, params.productId),
						eq(ProductGeoPlace.role, "primary_discovery"),
						eq(ProductGeoPlace.isPrimary, true)
					)
				)
				.then(first)
			if (current?.placeId === params.geoPlaceId) return
			if (current) {
				await tx
					.update(ProductGeoPlace)
					.set({ placeId: params.geoPlaceId, updatedAt: new Date() })
					.where(eq(ProductGeoPlace.id, current.id))
			} else {
				await tx.insert(ProductGeoPlace).values({
					id: `geo:product-place:${params.productId}`,
					productId: params.productId,
					placeId: params.geoPlaceId,
					role: "primary_discovery",
					isPrimary: true,
					source: params.source,
				})
			}
			await tx.insert(ProductGeoPlaceActivity).values({
				id: crypto.randomUUID(),
				productId: params.productId,
				previousPlaceId: current?.placeId ?? null,
				placeId: params.geoPlaceId,
				actorId: params.actorId ?? null,
				source: params.source,
			})
		})
	}

	async setProductPublication(params: {
		productId: string
		state: "draft" | "ready" | "published"
		validationErrorsJson?: unknown | null
	}): Promise<void> {
		const updatedAt = new Date()
		const updated = await db
			.update(Product)
			.set({
				publicationState: params.state,
				publicationValidationErrorsJson: params.validationErrorsJson ?? null,
				publicationUpdatedAt: updatedAt,
				lastUpdated: updatedAt,
			})
			.where(eq(Product.id, params.productId))
			.returning({ id: Product.id })
		if (!updated[0]) throw new Error("PRODUCT_NOT_FOUND")
	}

	async getProductAggregate(productId: string): Promise<ProductAggregate | null> {
		const product = await db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
				providerId: Product.providerId,
				geoPlaceId: ProductGeoPlace.placeId,
				publicationState: Product.publicationState,
				publicationValidationErrorsJson: Product.publicationValidationErrorsJson,
				publicationUpdatedAt: Product.publicationUpdatedAt,
			})
			.from(Product)
			.innerJoin(
				ProductGeoPlace,
				and(
					eq(ProductGeoPlace.productId, Product.id),
					eq(ProductGeoPlace.role, "primary_discovery"),
					eq(ProductGeoPlace.isPrimary, true)
				)
			)
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

		const images = await db
			.select({ id: Image.id })
			.from(ProductImage)
			.innerJoin(Image, eq(Image.id, ProductImage.imageId))
			.where(eq(ProductImage.productId, productId))

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
				.select({
					id: Variant.id,
					salesEnabled: Variant.salesEnabled,
					lifecycleState: Variant.lifecycleState,
					profileVariantId: TourSlotProfile.variantId,
					capacityVariantId: VariantCapacity.variantId,
					defaultRatePlanId: RatePlan.id,
				})
				.from(Variant)
				.leftJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
				.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
				.leftJoin(
					RatePlan,
					and(
						eq(RatePlan.variantId, Variant.id),
						eq(RatePlan.isDefault, true),
						eq(RatePlan.isActive, true)
					)
				)
				.where(and(eq(Variant.productId, productId), eq(Variant.kind, "tour_slot")))

			// Align with admin quality: complete salida = commercially enabled + profile + capacity + default rate.
			const completeSlotCount = schedules.filter(
				(row) =>
					row.salesEnabled === true &&
					row.lifecycleState === "ready" &&
					Boolean(row.profileVariantId) &&
					Boolean(row.capacityVariantId) &&
					Boolean(row.defaultRatePlanId)
			).length
			const activeSlotCount = schedules.filter(
				(row) => row.salesEnabled === true && row.lifecycleState === "ready"
			).length
			const itinerarySteps = Array.isArray(tour?.itineraryJson) ? tour.itineraryJson.length : 0
			const [categoryRow, ticketRow] = await Promise.all([
				db
					.select({ id: ProductCategoryLink.id })
					.from(ProductCategoryLink)
					.where(eq(ProductCategoryLink.productId, productId))
					.limit(1)
					.then(first),
				db
					.select({ id: TourTicketType.id })
					.from(TourTicketType)
					.where(and(eq(TourTicketType.productId, productId), eq(TourTicketType.isActive, true)))
					.limit(1)
					.then(first),
			])

			verticalReadiness = {
				kind: "tour",
				subtypeExists,
				tour: {
					hasItinerary: itinerarySteps > 0,
					itinerarySteps,
					hasMeetingPoint: tourHasMeetingPoint(tour?.meetingPointJson),
					hasDurationMinutes: tour?.durationMinutes != null && Number(tour.durationMinutes) > 0,
					hasIncludes: Array.isArray(tour?.includesJson) && tour.includesJson.length > 0,
					hasCategory: Boolean(categoryRow?.id),
					hasActiveTickets: Boolean(ticketRow?.id),
					hasSchedule: completeSlotCount > 0,
					imageCount: images.length,
					slotCount: schedules.length,
					completeSlotCount,
					activeSlotCount,
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

		const rawState = product.publicationState
		const publicationState: ProductPublicationState =
			rawState === "ready" || rawState === "published" ? rawState : "draft"

		return {
			product,
			imagesCount: images.length,
			subtypeExists,
			content: content ?? null,
			location: location ?? null,
			publication: {
				state: publicationState,
				validationErrorsJson: product.publicationValidationErrorsJson ?? null,
				updatedAt: product.publicationUpdatedAt ?? null,
			},
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
		const productImages = await db
			.select({ id: Image.id, objectKey: Image.objectKey, url: Image.url })
			.from(ProductImage)
			.innerJoin(Image, eq(Image.id, ProductImage.imageId))
			.where(eq(ProductImage.productId, productId))
		const variantImages = variantIds.length
			? await db
					.select({ id: Image.id, objectKey: Image.objectKey, url: Image.url })
					.from(VariantImage)
					.innerJoin(Image, eq(Image.id, VariantImage.imageId))
					.where(inArray(VariantImage.variantId, variantIds))
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
			await db.delete(VariantImage).where(inArray(VariantImage.variantId, variantIds))
			await db.delete(SearchUnitView).where(inArray(SearchUnitView.variantId, variantIds))
			await db
				.delete(EffectiveRestriction)
				.where(inArray(EffectiveRestriction.variantId, variantIds))
			await db
				.delete(EffectiveAvailability)
				.where(inArray(EffectiveAvailability.variantId, variantIds))
			await db
				.delete(ProviderExternalCalendarEvent)
				.where(inArray(ProviderExternalCalendarEvent.variantId, variantIds))
			await db
				.delete(ProviderExternalCalendar)
				.where(inArray(ProviderExternalCalendar.variantId, variantIds))
			await db
				.delete(ProviderIntegrationMapping)
				.where(
					and(
						eq(ProviderIntegrationMapping.localEntityType, "variant"),
						inArray(ProviderIntegrationMapping.localEntityId, variantIds)
					)
				)
			await db.delete(DailyInventory).where(inArray(DailyInventory.variantId, variantIds))
			await db
				.delete(VariantInventoryConfig)
				.where(inArray(VariantInventoryConfig.variantId, variantIds))
			await db.delete(VariantRoomAmenity).where(inArray(VariantRoomAmenity.variantId, variantIds))
			await db.delete(VariantRoomBed).where(inArray(VariantRoomBed.variantId, variantIds))
			await db.delete(VariantRoomProfile).where(inArray(VariantRoomProfile.variantId, variantIds))
			await db.delete(VariantCapacity).where(inArray(VariantCapacity.variantId, variantIds))
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
			.delete(ProviderIntegrationMapping)
			.where(
				and(
					eq(ProviderIntegrationMapping.localEntityType, "product"),
					eq(ProviderIntegrationMapping.localEntityId, productId)
				)
			)
		await db
			.delete(PolicyAssignment)
			.where(and(eq(PolicyAssignment.scope, "product"), eq(PolicyAssignment.scopeId, productId)))

		await db.delete(ProductImage).where(eq(ProductImage.productId, productId))
		if (imageIds.length) {
			await db.delete(Image).where(inArray(Image.id, imageIds))
		}
		await db.delete(HouseRule).where(eq(HouseRule.productId, productId))
		await db.delete(ProductContent).where(eq(ProductContent.productId, productId))
		await db.delete(ProductLocation).where(eq(ProductLocation.productId, productId))
		await db
			.delete(ProductOperationalSurface)
			.where(eq(ProductOperationalSurface.productId, productId))

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
