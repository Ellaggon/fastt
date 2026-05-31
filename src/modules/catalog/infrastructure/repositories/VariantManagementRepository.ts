import {
	db,
	Variant,
	VariantCapacity,
	VariantRoomProfile,
	VariantReadiness,
	Product,
	RoomType,
	RatePlan,
	DailyInventory,
	eq,
	and,
	count,
} from "astro:db"
import type {
	VariantLifecycleStatus,
	VariantManagementRepositoryPort,
	VariantReadinessSnapshot,
} from "../../application/ports/VariantManagementRepositoryPort"
import type { RatePlanPricingReadRepositoryPort } from "@/modules/pricing/application/ports/RatePlanPricingReadRepositoryPort"
import { RatePlanPricingReadRepository } from "@/modules/pricing/infrastructure/repositories/RatePlanPricingReadRepository"

export class VariantManagementRepository implements VariantManagementRepositoryPort {
	constructor(
		private readonly pricingReadRepository: RatePlanPricingReadRepositoryPort = new RatePlanPricingReadRepository()
	) {}

	async listVariantsByProductId(productId: string): Promise<
		Array<{
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
	> {
		const rows = await db
			.select({
				id: Variant.id,
				name: Variant.name,
				kind: Variant.kind,
				status: Variant.status,
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
			.all()

		return Promise.all(
			rows.map(async (r) => {
				const pricingSummary =
					await this.pricingReadRepository.getDefaultRatePlanPricingSummaryByVariant(String(r.id))
				return {
					id: r.id,
					name: r.name,
					kind: r.kind ?? null,
					status: r.status ?? null,
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
			.get()
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
				status: Variant.status,
				isActive: Variant.isActive,
			})
			.from(Variant)
			.where(eq(Variant.id, variantId))
			.get()
		return row ?? null
	}

	async createVariant(params: {
		id: string
		productId: string
		kind: "hotel_room" | "tour_slot" | "package_base" | "limousine_service"
		name: string
		description?: string | null
		status: VariantLifecycleStatus
		createdAt: Date
		isActive: boolean
	}) {
		await db.insert(Variant).values({
			id: params.id,
			productId: params.productId,
			name: params.name,
			description: params.description ?? null,
			kind: params.kind,
			status: params.status,
			createdAt: params.createdAt,
			isActive: params.isActive,
			// Legacy fields remain defaulted by DB.
		} as any)
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
			.get()

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
			.get()
		return row ?? null
	}

	async attachHotelRoomSubtype(params: { variantId: string; roomTypeId: string }) {
		const existing = await db
			.select({ variantId: VariantRoomProfile.variantId })
			.from(VariantRoomProfile)
			.where(eq(VariantRoomProfile.variantId, params.variantId))
			.get()
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
			totalRooms: 0,
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
			.get()
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
			.all()
		return rows.length > 0
	}

	async upsertReadiness(params: VariantReadinessSnapshot) {
		const existing = await db
			.select({ variantId: VariantReadiness.variantId })
			.from(VariantReadiness)
			.where(eq(VariantReadiness.variantId, params.variantId))
			.get()

		if (!existing) {
			await db.insert(VariantReadiness).values({
				variantId: params.variantId,
				state: params.state,
				validationErrorsJson: params.validationErrorsJson ?? null,
				updatedAt: new Date(),
			})
			return
		}

		await db
			.update(VariantReadiness)
			.set({
				state: params.state,
				validationErrorsJson: params.validationErrorsJson ?? null,
				updatedAt: new Date(),
			})
			.where(eq(VariantReadiness.variantId, params.variantId))
	}

	async getReadiness(variantId: string) {
		const row = await db
			.select({
				variantId: VariantReadiness.variantId,
				state: VariantReadiness.state,
				validationErrorsJson: VariantReadiness.validationErrorsJson,
			})
			.from(VariantReadiness)
			.where(eq(VariantReadiness.variantId, variantId))
			.get()

		if (!row) return null

		// We only ever write "draft"|"ready" from application use-cases.
		return {
			variantId: row.variantId,
			state: row.state as VariantReadinessSnapshot["state"],
			validationErrorsJson: row.validationErrorsJson ?? null,
		}
	}

	async updateVariantStatus(params: {
		variantId: string
		status: VariantLifecycleStatus
		isActive?: boolean
	}) {
		await db
			.update(Variant)
			.set({
				status: params.status,
				isActive: params.isActive ?? undefined,
			} as any)
			.where(eq(Variant.id, params.variantId))
	}

	async countDailyInventoryDays(variantId: string): Promise<number> {
		const row = await db
			.select({ value: count() })
			.from(DailyInventory)
			.where(eq(DailyInventory.variantId, variantId))
			.get()
		return Number(row?.value ?? 0)
	}
}
