import {
	db,
	Variant,
	VariantCapacity,
	VariantHotelRoom,
	VariantReadiness,
	Product,
	RoomType,
	PricingBaseRate,
	RatePlan,
	PriceRule,
	eq,
	and,
	asc,
} from "astro:db"
import type {
	VariantLifecycleStatus,
	VariantManagementRepositoryPort,
	VariantReadinessSnapshot,
} from "../../application/ports/VariantManagementRepositoryPort"

export class VariantManagementRepository implements VariantManagementRepositoryPort {
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
			.from(Variant)
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.leftJoin(VariantHotelRoom, eq(VariantHotelRoom.variantId, Variant.id))
			.leftJoin(RoomType, eq(RoomType.id, VariantHotelRoom.roomTypeId))
			.leftJoin(PricingBaseRate, eq(PricingBaseRate.variantId, Variant.id))
			.leftJoin(RatePlan, and(eq(RatePlan.variantId, Variant.id), eq(RatePlan.isDefault, true)))
			.where(eq(Variant.productId, productId))
			.all()

		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			kind: r.kind ?? null,
			status: r.status ?? null,
			pricing: {
				hasBaseRate: Boolean(r.baseRateVariantId),
				hasDefaultRatePlan: Boolean(r.defaultRatePlanId),
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
				r.hotelRoomVariantId && r.roomTypeId
					? { roomTypeId: r.roomTypeId, name: r.roomTypeName ?? null }
					: null,
		}))
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
		const row = await db.select().from(Variant).where(eq(Variant.id, variantId)).get()
		return row ?? null
	}

	async createVariant(params: {
		id: string
		productId: string
		kind: "hotel_room" | "tour_slot" | "package_base"
		name: string
		description?: string | null
		status: VariantLifecycleStatus
		createdAt: Date
		entityType: string
		entityId: string
		isActive: boolean
	}) {
		await db.insert(Variant).values({
			id: params.id,
			productId: params.productId,
			entityType: params.entityType,
			entityId: params.entityId,
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

			// Sync deprecated legacy occupancy fields.
			await db
				.update(Variant)
				.set({
					minOccupancy: params.minOccupancy,
					maxOccupancy: params.maxOccupancy,
				} as any)
				.where(eq(Variant.id, params.variantId))
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

		// Keep deprecated legacy occupancy fields in sync for backward compatibility
		// with existing pricing/inventory/search logic until CAPA 4/5 fully migrate.
		await db
			.update(Variant)
			.set({
				minOccupancy: params.minOccupancy,
				maxOccupancy: params.maxOccupancy,
			} as any)
			.where(eq(Variant.id, params.variantId))
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
		await db.insert(VariantHotelRoom).values({
			variantId: params.variantId,
			roomTypeId: params.roomTypeId,
		})
	}

	async getHotelRoomSubtype(variantId: string) {
		const row = await db
			.select()
			.from(VariantHotelRoom)
			.where(eq(VariantHotelRoom.variantId, variantId))
			.get()
		return row ?? null
	}

	async existsHotelRoomSubtypeForProductRoomType(params: {
		productId: string
		roomTypeId: string
	}) {
		// Join VariantHotelRoom -> Variant to check uniqueness by (productId, roomTypeId)
		const rows = await db
			.select({ variantId: VariantHotelRoom.variantId })
			.from(VariantHotelRoom)
			.leftJoin(Variant, eq(Variant.id, VariantHotelRoom.variantId))
			.where(
				and(
					eq(Variant.productId, params.productId),
					eq(VariantHotelRoom.roomTypeId, params.roomTypeId)
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

	async hasBaseRate(variantId: string): Promise<boolean> {
		return Boolean(await this.getBaseRate(variantId))
	}

	async getBaseRate(variantId: string) {
		const row = await db
			.select({
				variantId: PricingBaseRate.variantId,
				currency: PricingBaseRate.currency,
				basePrice: PricingBaseRate.basePrice,
			})
			.from(PricingBaseRate)
			.where(eq(PricingBaseRate.variantId, variantId))
			.get()
		return row ?? null
	}

	async getDefaultRatePlanWithRules(variantId: string) {
		const plan = await db
			.select({ id: RatePlan.id })
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, variantId),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.get()
		if (!plan?.id) return null

		const rules = await db
			.select({
				id: PriceRule.id,
				type: PriceRule.type,
				value: PriceRule.value,
				createdAt: PriceRule.createdAt,
			})
			.from(PriceRule)
			.where(and(eq(PriceRule.ratePlanId, plan.id), eq(PriceRule.isActive, true)))
			.orderBy(asc(PriceRule.createdAt))
			.all()

		return {
			ratePlanId: plan.id,
			rules: rules.map((r) => ({
				id: r.id,
				type: String(r.type),
				value: Number(r.value),
				createdAt: r.createdAt,
			})),
		}
	}
}
