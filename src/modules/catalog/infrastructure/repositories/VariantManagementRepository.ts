import {
	first,
	db,
	Variant,
	VariantCapacity,
	VariantRoomProfile,
	Product,
	RoomType,
	RatePlan,
	DailyInventory,
	EffectiveAvailability,
	EffectiveRestriction,
	Image,
	ImageUpload,
	VariantImage,
	SearchUnitView,
	CommercialRuleApplication,
	TaxFeeAssignment,
	PolicyAssignment,
	VariantInventoryConfig,
	VariantRoomAmenity,
	VariantRoomBed,
	BookingLineItem,
	InventoryLock,
	Hold,
	ProviderExternalCalendar,
	ProviderExternalCalendarEvent,
	ProviderIntegrationMapping,
	TourSlotProfile,
	eq,
	and,
	count,
	inArray,
} from "@/shared/infrastructure/db/compat"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import type {
	VariantLifecycleState,
	VariantManagementRepositoryPort,
	VariantLifecycleEvaluation,
} from "../../application/ports/VariantManagementRepositoryPort"
import type { RatePlanPricingReadRepositoryPort } from "../../../pricing/application/ports/RatePlanPricingReadRepositoryPort"
import { RatePlanPricingReadRepository } from "../../../pricing/infrastructure/repositories/RatePlanPricingReadRepository"
import type { RatePlanCommandRepositoryPort } from "../../../pricing/application/ports/RatePlanCommandRepositoryPort"
import { RatePlanCommandRepository } from "../../../pricing/infrastructure/repositories/RatePlanCommandRepository"

function toLifecycleState(value: string | null | undefined): VariantLifecycleState {
	if (value === "ready" || value === "archived") return value
	return "draft"
}

export class VariantManagementRepository implements VariantManagementRepositoryPort {
	constructor(
		private readonly pricingReadRepository: RatePlanPricingReadRepositoryPort = new RatePlanPricingReadRepository(),
		private readonly r2?: S3Client,
		private readonly ratePlanCommands: RatePlanCommandRepositoryPort = new RatePlanCommandRepository()
	) {}

	async listVariantsByProductId(productId: string): Promise<
		Array<{
			id: string
			name: string
			kind: string | null
			lifecycleState: VariantLifecycleState
			pricing: { hasBaseRate: boolean; hasDefaultRatePlan: boolean }
			capacity: {
				minOccupancy: number
				maxOccupancy: number
				maxAdults: number | null
				maxChildren: number | null
			} | null
			subtype: { roomTypeId: string; name: string | null } | null
		}>
	> {
		const rows = await db
			.select({
				id: Variant.id,
				name: Variant.name,
				kind: Variant.kind,
				lifecycleState: Variant.lifecycleState,
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
			.from(Variant)
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
			.where(eq(Variant.productId, productId))

		return Promise.all(
			rows.map(async (r) => {
				const pricingSummary =
					await this.pricingReadRepository.getDefaultRatePlanPricingSummaryByVariant(String(r.id))
				return {
					id: r.id,
					name: r.name,
					kind: r.kind ?? null,
					lifecycleState: toLifecycleState(r.lifecycleState),
					pricing: {
						hasBaseRate: pricingSummary != null,
						hasDefaultRatePlan: pricingSummary != null,
					},
					capacity: r.capVariantId
						? {
								minOccupancy: r.minOccupancy ?? 0,
								maxOccupancy: r.maxOccupancy ?? 0,
								maxAdults: r.maxAdults ?? null,
								maxChildren: r.maxChildren ?? null,
							}
						: null,
					subtype:
						r.roomProfileVariantId && r.roomTypeId
							? { roomTypeId: r.roomTypeId, name: r.roomTypeName ?? null }
							: null,
				}
			})
		)
	}

	async getProductById(productId: string) {
		const row = await db
			.select({ id: Product.id, productType: Product.productType, providerId: Product.providerId })
			.from(Product)
			.where(eq(Product.id, productId))
			.then(first)
		return row ?? null
	}

	async getVariantById(variantId: string) {
		const row = await db
			.select({
				id: Variant.id,
				productId: Variant.productId,
				kind: Variant.kind,
				name: Variant.name,
				description: Variant.description,
				externalCode: Variant.externalCode,
				lifecycleState: Variant.lifecycleState,
				salesEnabled: Variant.salesEnabled,
			})
			.from(Variant)
			.where(eq(Variant.id, variantId))
			.then(first)
		return row
			? {
					...row,
					lifecycleState: toLifecycleState(row.lifecycleState),
					salesEnabled: Boolean(row.salesEnabled),
				}
			: null
	}

	async createVariant(params: {
		id: string
		productId: string
		kind: "hotel_room" | "tour_slot" | "package_base" | "limousine_service"
		name: string
		description?: string | null
		lifecycleState: VariantLifecycleState
		createdAt: Date
		salesEnabled: boolean
	}) {
		await db.insert(Variant).values({
			id: params.id,
			productId: params.productId,
			name: params.name,
			description: params.description ?? null,
			kind: params.kind,
			lifecycleState: params.lifecycleState,
			createdAt: params.createdAt,
			salesEnabled: params.salesEnabled,
		})
	}

	async upsertCapacity(params: {
		variantId: string
		minOccupancy: number
		maxOccupancy: number
		maxAdults?: number | null
		maxChildren?: number | null
	}) {
		const existing = await db
			.select({ variantId: VariantCapacity.variantId })
			.from(VariantCapacity)
			.where(eq(VariantCapacity.variantId, params.variantId))
			.then(first)

		if (!existing) {
			await db.insert(VariantCapacity).values({
				variantId: params.variantId,
				minOccupancy: params.minOccupancy,
				maxOccupancy: params.maxOccupancy,
				maxAdults: params.maxAdults ?? null,
				maxChildren: params.maxChildren ?? null,
			})
			return
		}

		await db
			.update(VariantCapacity)
			.set({
				minOccupancy: params.minOccupancy,
				maxOccupancy: params.maxOccupancy,
				maxAdults: params.maxAdults ?? null,
				maxChildren: params.maxChildren ?? null,
			})
			.where(eq(VariantCapacity.variantId, params.variantId))
	}

	async getCapacity(variantId: string) {
		const row = await db
			.select()
			.from(VariantCapacity)
			.where(eq(VariantCapacity.variantId, variantId))
			.then(first)
		return row ?? null
	}

	async attachHotelRoomSubtype(params: { variantId: string; roomTypeId: string }) {
		const existing = await db
			.select({ variantId: VariantRoomProfile.variantId })
			.from(VariantRoomProfile)
			.where(eq(VariantRoomProfile.variantId, params.variantId))
			.then(first)
		if (existing) {
			await db
				.update(VariantRoomProfile)
				.set({ roomTypeId: params.roomTypeId, updatedAt: new Date() })
				.where(eq(VariantRoomProfile.variantId, params.variantId))
			return
		}

		await db.insert(VariantRoomProfile).values({
			variantId: params.variantId,
			roomTypeId: params.roomTypeId,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
	}

	async getHotelRoomSubtype(variantId: string) {
		const row = await db
			.select({
				variantId: VariantRoomProfile.variantId,
				roomTypeId: VariantRoomProfile.roomTypeId,
			})
			.from(VariantRoomProfile)
			.where(eq(VariantRoomProfile.variantId, variantId))
			.then(first)
		return row?.roomTypeId ? { variantId: row.variantId, roomTypeId: row.roomTypeId } : null
	}

	async existsHotelRoomSubtypeForProductRoomType(params: {
		productId: string
		roomTypeId: string
	}) {
		// Join VariantRoomProfile -> Variant to check uniqueness by (productId, roomTypeId).
		const rows = await db
			.select({ variantId: VariantRoomProfile.variantId })
			.from(VariantRoomProfile)
			.leftJoin(Variant, eq(Variant.id, VariantRoomProfile.variantId))
			.where(
				and(
					eq(Variant.productId, params.productId),
					eq(VariantRoomProfile.roomTypeId, params.roomTypeId)
				)
			)

		return rows.length > 0
	}

	async persistLifecycleEvaluation(params: VariantLifecycleEvaluation) {
		const evaluatedAt = new Date()
		const updated = await db
			.update(Variant)
			.set({
				lifecycleState: params.lifecycleState,
				lifecycleValidationErrorsJson: params.validationErrorsJson ?? null,
				lifecycleEvaluatedAt: evaluatedAt,
				// A failed validation always removes sale intent; a successful check preserves it.
				salesEnabled: params.lifecycleState === "draft" ? false : undefined,
			})
			.where(eq(Variant.id, params.variantId))
			.returning({ id: Variant.id })
		if (!updated[0]) throw new Error("VARIANT_NOT_FOUND")
	}

	async getLifecycleEvaluation(variantId: string) {
		const row = await db
			.select({
				variantId: Variant.id,
				lifecycleState: Variant.lifecycleState,
				validationErrorsJson: Variant.lifecycleValidationErrorsJson,
			})
			.from(Variant)
			.where(eq(Variant.id, variantId))
			.then(first)

		if (!row) return null

		return {
			variantId: row.variantId,
			lifecycleState:
				toLifecycleState(row.lifecycleState) === "ready" ? ("ready" as const) : ("draft" as const),
			validationErrorsJson: row.validationErrorsJson ?? null,
		}
	}

	async updateVariantLifecycle(params: {
		variantId: string
		lifecycleState: VariantLifecycleState
	}) {
		const lifecycleEvaluatedAt = new Date()
		await db
			.update(Variant)
			.set({
				lifecycleState: params.lifecycleState,
				lifecycleEvaluatedAt,
				salesEnabled: params.lifecycleState === "ready" ? undefined : false,
			})
			.where(eq(Variant.id, params.variantId))
	}

	async setVariantSalesEnabled(params: { variantId: string; salesEnabled: boolean }) {
		const updated = await db
			.update(Variant)
			.set({ salesEnabled: params.salesEnabled })
			.where(eq(Variant.id, params.variantId))
			.returning({ id: Variant.id })
		if (!updated[0]) throw new Error("VARIANT_NOT_FOUND")
	}

	async deleteVariantCascade(variantId: string) {
		if (!variantId) return
		const variant = await db.select().from(Variant).where(eq(Variant.id, variantId)).then(first)
		if (!variant) return

		const bookingRows = await db
			.select({ id: BookingLineItem.id })
			.from(BookingLineItem)
			.where(eq(BookingLineItem.variantId, variantId))

		const lockRows = await db
			.select({ id: InventoryLock.id })
			.from(InventoryLock)
			.where(eq(InventoryLock.variantId, variantId))

		const holdRows = await db
			.select({ id: Hold.id })
			.from(Hold)
			.where(eq(Hold.variantId, variantId))

		if (bookingRows.length || lockRows.length || holdRows.length) {
			throw new Error("variant_has_transactions")
		}

		const ratePlans = await db.select().from(RatePlan).where(eq(RatePlan.variantId, variantId))

		const ratePlanIds = ratePlans.map((ratePlan) => String(ratePlan.id))
		const images = await db
			.select({ id: Image.id, objectKey: Image.objectKey, url: Image.url })
			.from(VariantImage)
			.innerJoin(Image, eq(Image.id, VariantImage.imageId))
			.where(eq(VariantImage.variantId, variantId))

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

		await this.ratePlanCommands.purgeEffectivePricingByVariantIds([variantId])
		await db
			.delete(CommercialRuleApplication)
			.where(
				and(
					eq(CommercialRuleApplication.scope, "variant"),
					eq(CommercialRuleApplication.scopeId, variantId)
				)
			)
		await db
			.delete(TaxFeeAssignment)
			.where(and(eq(TaxFeeAssignment.scope, "variant"), eq(TaxFeeAssignment.scopeId, variantId)))
		await db
			.delete(PolicyAssignment)
			.where(and(eq(PolicyAssignment.scope, "variant"), eq(PolicyAssignment.scopeId, variantId)))
		if (imageIds.length) {
			await db.delete(VariantImage).where(eq(VariantImage.variantId, variantId))
			await db.delete(Image).where(inArray(Image.id, imageIds))
		}
		await db.delete(SearchUnitView).where(eq(SearchUnitView.variantId, variantId))
		await db.delete(EffectiveRestriction).where(eq(EffectiveRestriction.variantId, variantId))
		await db.delete(EffectiveAvailability).where(eq(EffectiveAvailability.variantId, variantId))
		await db
			.delete(ProviderExternalCalendarEvent)
			.where(eq(ProviderExternalCalendarEvent.variantId, variantId))
		await db
			.delete(ProviderExternalCalendar)
			.where(eq(ProviderExternalCalendar.variantId, variantId))
		await db
			.delete(ProviderIntegrationMapping)
			.where(
				and(
					eq(ProviderIntegrationMapping.localEntityType, "variant"),
					eq(ProviderIntegrationMapping.localEntityId, variantId)
				)
			)
		await db.delete(DailyInventory).where(eq(DailyInventory.variantId, variantId))
		await db.delete(VariantInventoryConfig).where(eq(VariantInventoryConfig.variantId, variantId))
		await db.delete(VariantRoomAmenity).where(eq(VariantRoomAmenity.variantId, variantId))
		await db.delete(VariantRoomBed).where(eq(VariantRoomBed.variantId, variantId))
		await db.delete(VariantRoomProfile).where(eq(VariantRoomProfile.variantId, variantId))
		await db.delete(VariantCapacity).where(eq(VariantCapacity.variantId, variantId))
		await db.delete(Variant).where(eq(Variant.id, variantId))

		if (!this.r2 || !process.env.R2_BUCKET_NAME) return
		for (const key of imageObjectKeys) {
			try {
				await this.r2.send(
					new DeleteObjectCommand({
						Bucket: process.env.R2_BUCKET_NAME,
						Key: key,
					})
				)
			} catch (error) {
				console.warn("Failed to delete variant image from R2", error)
			}
		}
	}

	async countDailyInventoryDays(variantId: string): Promise<number> {
		const row = await db
			.select({ value: count() })
			.from(DailyInventory)
			.where(eq(DailyInventory.variantId, variantId))
			.then(first)
		return Number(row?.value ?? 0)
	}

	async countVariantImages(variantId: string): Promise<number> {
		const row = await db
			.select({ value: count() })
			.from(VariantImage)
			.where(eq(VariantImage.variantId, variantId))
			.then(first)
		return Number(row?.value ?? 0)
	}

	async hasTourSlotProfile(variantId: string): Promise<boolean> {
		const row = await db
			.select({ variantId: TourSlotProfile.variantId })
			.from(TourSlotProfile)
			.where(eq(TourSlotProfile.variantId, variantId))
			.then(first)
		return Boolean(row?.variantId)
	}
}
