import {
	and,
	db,
	eq,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	gte,
	inArray,
	lt,
	RatePlan,
	SearchUnitView,
	sql,
	Variant,
	VariantCapacity,
} from "astro:db"
import { createHash } from "node:crypto"

export type SearchUnitViewReadRow = {
	variantId: string
	ratePlanId: string
	date: string
	isSellable: boolean
	isAvailable: boolean
	hasAvailability: boolean
	hasPrice: boolean
	stopSell: boolean
	availableUnits: number
	pricePerNight: number | null
	minStay: number | null
	cta: boolean
	ctd: boolean
	primaryBlocker: string | null
}

export type EffectivePricingV2ReadRow = {
	variantId: string
	ratePlanId: string
	date: string
	occupancyKey: string
	finalBasePrice: number
	baseComponent: number
	occupancyAdjustment: number
	ruleAdjustment: number
}

export type SearchUnitViewUpsertRow = {
	id: string
	variantId: string
	productId: string
	ratePlanId: string
	date: string
	occupancyKey: string
	totalGuests: number
	hasAvailability: boolean
	hasPrice: boolean
	isSellable: boolean
	isAvailable: boolean
	availableUnits: number
	stopSell: boolean
	pricePerNight: number | null
	currency: string
	primaryBlocker: string | null
	minStay: number | null
	cta: boolean
	ctd: boolean
	computedAt: Date
	sourceVersion: string
}

export type SearchUnitViewStoredRow = {
	variantId: string
	ratePlanId: string
	date: string
	occupancyKey: string
	totalGuests: number
	hasAvailability: boolean
	hasPrice: boolean
	isSellable: boolean
	isAvailable: boolean
	availableUnits: number
	stopSell: boolean
	pricePerNight: number | null
	currency: string
	primaryBlocker: string | null
	minStay: number | null
	cta: boolean
	ctd: boolean
	computedAt: string
	sourceVersion: string
}

export type SearchViewVariantScopeRow = {
	variantId: string
	productId: string
	isActive: boolean
}

export type SearchViewHealthRow = {
	variantId: string
	date: string
	occupancyKey: string
	primaryBlocker: string | null
	computedAt: string
}

export const searchReadModelRepository = {
	async listSearchViewVariantScope(params?: {
		variantId?: string
		productId?: string
		activeOnly?: boolean
	}): Promise<SearchViewVariantScopeRow[]> {
		const activeOnly = params?.activeOnly ?? true
		const filters = [] as Array<ReturnType<typeof eq>>
		if (params?.variantId) {
			filters.push(eq(Variant.id, params.variantId))
		}
		if (params?.productId) {
			filters.push(eq(Variant.productId, params.productId))
		}
		if (activeOnly) {
			filters.push(eq(Variant.isActive, true))
		}
		const whereClause =
			filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters)
		const query = db
			.select({
				variantId: Variant.id,
				productId: Variant.productId,
				isActive: Variant.isActive,
			})
			.from(Variant)
		const rows = whereClause ? await query.where(whereClause).all() : await query.all()
		return rows.map((row) => ({
			variantId: String(row.variantId),
			productId: String(row.productId),
			isActive: Boolean(row.isActive),
		}))
	},

	async listSearchViewHealthRows(params: {
		variantIds: string[]
		from: string
		to: string
		occupancyKeys: string[]
	}): Promise<SearchViewHealthRow[]> {
		if (params.variantIds.length === 0 || params.occupancyKeys.length === 0) return []
		const rows = await db
			.select({
				variantId: SearchUnitView.variantId,
				date: SearchUnitView.date,
				occupancyKey: SearchUnitView.occupancyKey,
				primaryBlocker: SearchUnitView.primaryBlocker,
				computedAt: SearchUnitView.computedAt,
			})
			.from(SearchUnitView)
			.where(
				and(
					inArray(SearchUnitView.variantId, params.variantIds),
					gte(SearchUnitView.date, params.from),
					lt(SearchUnitView.date, params.to),
					inArray(SearchUnitView.occupancyKey, params.occupancyKeys)
				)
			)
			.all()
		return rows.map((row) => ({
			variantId: String(row.variantId),
			date: String(row.date),
			occupancyKey: String(row.occupancyKey),
			primaryBlocker: row.primaryBlocker == null ? null : String(row.primaryBlocker),
			computedAt: new Date(row.computedAt).toISOString(),
		}))
	},

	async purgeStaleSearchUnitRows(cutoff: Date): Promise<number> {
		const result = await db
			.delete(SearchUnitView)
			.where(lt(SearchUnitView.computedAt, cutoff))
			.run()
		return Number((result as { rowsAffected?: unknown })?.rowsAffected ?? 0)
	},

	async listSearchUnitViewRows(params: {
		unitIds: string[]
		from: string
		to: string
		occupancyKey: string
	}): Promise<SearchUnitViewReadRow[]> {
		if (!params.unitIds.length) return []
		const rows = await db
			.select({
				variantId: SearchUnitView.variantId,
				ratePlanId: SearchUnitView.ratePlanId,
				date: SearchUnitView.date,
				isSellable: SearchUnitView.isSellable,
				isAvailable: SearchUnitView.isAvailable,
				hasAvailability: SearchUnitView.hasAvailability,
				hasPrice: SearchUnitView.hasPrice,
				stopSell: SearchUnitView.stopSell,
				availableUnits: SearchUnitView.availableUnits,
				pricePerNight: SearchUnitView.pricePerNight,
				minStay: SearchUnitView.minStay,
				cta: SearchUnitView.cta,
				ctd: SearchUnitView.ctd,
				primaryBlocker: SearchUnitView.primaryBlocker,
			})
			.from(SearchUnitView)
			.where(
				and(
					inArray(SearchUnitView.variantId, params.unitIds),
					gte(SearchUnitView.date, params.from),
					lt(SearchUnitView.date, params.to),
					eq(SearchUnitView.occupancyKey, params.occupancyKey)
				)
			)
			.all()

		return rows.map((row) => ({
			variantId: String(row.variantId),
			ratePlanId: String(row.ratePlanId),
			date: String(row.date),
			isSellable: Boolean(row.isSellable),
			isAvailable: Boolean(row.isAvailable),
			hasAvailability: Boolean(row.hasAvailability),
			hasPrice: Boolean(row.hasPrice),
			stopSell: Boolean(row.stopSell),
			availableUnits: Math.max(0, Number(row.availableUnits ?? 0)),
			pricePerNight: row.pricePerNight == null ? null : Number(row.pricePerNight),
			minStay: row.minStay == null ? null : Number(row.minStay),
			cta: Boolean(row.cta),
			ctd: Boolean(row.ctd),
			primaryBlocker: row.primaryBlocker == null ? null : String(row.primaryBlocker),
		}))
	},

	async listEffectivePricingV2Rows(params: {
		unitIds: string[]
		ratePlanIds: string[]
		from: string
		to: string
		occupancyKey: string
	}): Promise<EffectivePricingV2ReadRow[]> {
		if (!params.unitIds.length || !params.ratePlanIds.length) return []
		if (!EffectivePricingV2 || !(EffectivePricingV2 as any).variantId) return []
		const rows = await db
			.select({
				variantId: EffectivePricingV2.variantId,
				ratePlanId: EffectivePricingV2.ratePlanId,
				date: EffectivePricingV2.date,
				occupancyKey: EffectivePricingV2.occupancyKey,
				finalBasePrice: EffectivePricingV2.finalBasePrice,
				baseComponent: EffectivePricingV2.baseComponent,
				occupancyAdjustment: EffectivePricingV2.occupancyAdjustment,
				ruleAdjustment: EffectivePricingV2.ruleAdjustment,
			})
			.from(EffectivePricingV2)
			.where(
				and(
					inArray(EffectivePricingV2.variantId, params.unitIds),
					inArray(EffectivePricingV2.ratePlanId, params.ratePlanIds),
					gte(EffectivePricingV2.date, params.from),
					lt(EffectivePricingV2.date, params.to),
					eq(EffectivePricingV2.occupancyKey, params.occupancyKey)
				)
			)
			.all()

		return rows.map((row) => ({
			variantId: String(row.variantId),
			ratePlanId: String(row.ratePlanId),
			date: String(row.date),
			occupancyKey: String(row.occupancyKey),
			finalBasePrice: Number(row.finalBasePrice),
			baseComponent: Number(row.baseComponent ?? 0),
			occupancyAdjustment: Number(row.occupancyAdjustment ?? 0),
			ruleAdjustment: Number(row.ruleAdjustment ?? 0),
		}))
	},

	async resolveDefaultRatePlanIds(variantId: string): Promise<string[]> {
		const rows = await db
			.select({ id: RatePlan.id })
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, variantId),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.all()
		return rows.map((row) => String(row.id)).filter(Boolean)
	},

	async resolveProductId(variantId: string): Promise<string | null> {
		const row = await db
			.select({ productId: Variant.productId })
			.from(Variant)
			.where(eq(Variant.id, variantId))
			.get()
		return row?.productId ? String(row.productId) : null
	},

	async resolveGuestRange(variantId: string): Promise<number[]> {
		const capacity = await db
			.select({ maxOccupancy: VariantCapacity.maxOccupancy })
			.from(VariantCapacity)
			.where(eq(VariantCapacity.variantId, variantId))
			.get()
		const maxOccupancy = Math.max(1, Number(capacity?.maxOccupancy ?? 2))
		return Array.from({ length: maxOccupancy }, (_, i) => i + 1)
	},

	async loadMaterializationInputs(params: {
		variantId: string
		ratePlanId: string
		date: string
		occupancyKey: string
	}) {
		const pricingReadPromise: Promise<{ finalBasePrice: number | null } | null> =
			EffectivePricingV2 && (EffectivePricingV2 as any).variantId
				? db
						.select({
							finalBasePrice: EffectivePricingV2.finalBasePrice,
						})
						.from(EffectivePricingV2)
						.where(
							and(
								eq(EffectivePricingV2.variantId, params.variantId),
								eq(EffectivePricingV2.ratePlanId, params.ratePlanId),
								eq(EffectivePricingV2.date, params.date),
								eq(EffectivePricingV2.occupancyKey, params.occupancyKey)
							)
						)
						.get()
						.then((row) => row ?? null)
				: Promise.resolve(null)
		const [availabilityRow, pricingRow, restrictionRow] = await Promise.all([
			db
				.select({
					isSellable: EffectiveAvailability.isSellable,
					stopSell: EffectiveAvailability.stopSell,
					availableUnits: EffectiveAvailability.availableUnits,
				})
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, params.variantId),
						eq(EffectiveAvailability.date, params.date)
					)
				)
				.get(),
			pricingReadPromise.then((v2Pricing) => {
				if (
					v2Pricing?.finalBasePrice != null &&
					Number.isFinite(Number(v2Pricing.finalBasePrice))
				) {
					return { finalBasePrice: Number(v2Pricing.finalBasePrice) }
				}
				return null
			}),
			db
				.select({
					stopSell: EffectiveRestriction.stopSell,
					minStay: EffectiveRestriction.minStay,
					cta: EffectiveRestriction.cta,
					ctd: EffectiveRestriction.ctd,
				})
				.from(EffectiveRestriction)
				.where(
					and(
						eq(EffectiveRestriction.variantId, params.variantId),
						eq(EffectiveRestriction.date, params.date)
					)
				)
				.get(),
		])

		return { availabilityRow, pricingRow, restrictionRow }
	},

	async resolveSourceVersion(params: {
		variantId: string
		ratePlanId: string
		date: string
	}): Promise<string> {
		const pricingVersionPromise =
			EffectivePricingV2 && (EffectivePricingV2 as any).variantId
				? db
						.select({ computedAt: EffectivePricingV2.computedAt })
						.from(EffectivePricingV2)
						.where(
							and(
								eq(EffectivePricingV2.variantId, params.variantId),
								eq(EffectivePricingV2.ratePlanId, params.ratePlanId),
								eq(EffectivePricingV2.date, params.date)
							)
						)
						.get()
				: Promise.resolve(null)
		const [availabilityRow, pricingRow, restrictionRow] = await Promise.all([
			db
				.select({ computedAt: EffectiveAvailability.computedAt })
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, params.variantId),
						eq(EffectiveAvailability.date, params.date)
					)
				)
				.get(),
			pricingVersionPromise,
			db
				.select({ computedAt: EffectiveRestriction.computedAt })
				.from(EffectiveRestriction)
				.where(
					and(
						eq(EffectiveRestriction.variantId, params.variantId),
						eq(EffectiveRestriction.date, params.date)
					)
				)
				.get(),
		])
		const a = availabilityRow?.computedAt
			? new Date(availabilityRow.computedAt).toISOString()
			: "na"
		const p = pricingRow?.computedAt ? new Date(pricingRow.computedAt).toISOString() : "np"
		const restrictionTimestamp =
			restrictionRow?.computedAt != null ? new Date(restrictionRow.computedAt).toISOString() : "nr"
		return createHash("sha1").update(`${a}|${p}|${restrictionTimestamp}`).digest("hex")
	},

	async upsertSearchUnitViewRow(row: SearchUnitViewUpsertRow): Promise<void> {
		await db
			.insert(SearchUnitView)
			.values(row as any)
			.onConflictDoUpdate({
				target: [
					SearchUnitView.variantId,
					SearchUnitView.ratePlanId,
					SearchUnitView.date,
					SearchUnitView.occupancyKey,
				],
				set: {
					productId: sql`excluded.productId`,
					totalGuests: sql`excluded.totalGuests`,
					hasAvailability: sql`excluded.hasAvailability`,
					hasPrice: sql`excluded.hasPrice`,
					isSellable: sql`excluded.isSellable`,
					isAvailable: sql`excluded.isAvailable`,
					availableUnits: sql`excluded.availableUnits`,
					stopSell: sql`excluded.stopSell`,
					pricePerNight: sql`excluded.pricePerNight`,
					currency: sql`excluded.currency`,
					primaryBlocker: sql`excluded.primaryBlocker`,
					minStay: sql`excluded.minStay`,
					cta: sql`excluded.cta`,
					ctd: sql`excluded.ctd`,
					computedAt: sql`excluded.computedAt`,
					sourceVersion: sql`excluded.sourceVersion`,
				},
			})
			.run()
	},

	async getSearchUnitViewRow(params: {
		variantId: string
		ratePlanId: string
		date: string
		occupancyKey: string
	}): Promise<SearchUnitViewStoredRow | null> {
		const row = await db
			.select({
				variantId: SearchUnitView.variantId,
				ratePlanId: SearchUnitView.ratePlanId,
				date: SearchUnitView.date,
				occupancyKey: SearchUnitView.occupancyKey,
				totalGuests: SearchUnitView.totalGuests,
				hasAvailability: SearchUnitView.hasAvailability,
				hasPrice: SearchUnitView.hasPrice,
				isSellable: SearchUnitView.isSellable,
				isAvailable: SearchUnitView.isAvailable,
				availableUnits: SearchUnitView.availableUnits,
				stopSell: SearchUnitView.stopSell,
				pricePerNight: SearchUnitView.pricePerNight,
				currency: SearchUnitView.currency,
				primaryBlocker: SearchUnitView.primaryBlocker,
				minStay: SearchUnitView.minStay,
				cta: SearchUnitView.cta,
				ctd: SearchUnitView.ctd,
				computedAt: SearchUnitView.computedAt,
				sourceVersion: SearchUnitView.sourceVersion,
			})
			.from(SearchUnitView)
			.where(
				and(
					eq(SearchUnitView.variantId, params.variantId),
					eq(SearchUnitView.ratePlanId, params.ratePlanId),
					eq(SearchUnitView.date, params.date),
					eq(SearchUnitView.occupancyKey, params.occupancyKey)
				)
			)
			.get()
		if (!row) return null
		return {
			variantId: String(row.variantId),
			ratePlanId: String(row.ratePlanId),
			date: String(row.date),
			occupancyKey: String(row.occupancyKey),
			totalGuests: Number(row.totalGuests ?? 0),
			hasAvailability: Boolean(row.hasAvailability),
			hasPrice: Boolean(row.hasPrice),
			isSellable: Boolean(row.isSellable),
			isAvailable: Boolean(row.isAvailable),
			availableUnits: Number(row.availableUnits ?? 0),
			stopSell: Boolean(row.stopSell),
			pricePerNight: row.pricePerNight == null ? null : Number(row.pricePerNight),
			currency: String(row.currency ?? "USD"),
			primaryBlocker: row.primaryBlocker == null ? null : String(row.primaryBlocker),
			minStay: row.minStay == null ? null : Number(row.minStay),
			cta: Boolean(row.cta),
			ctd: Boolean(row.ctd),
			computedAt: new Date(row.computedAt).toISOString(),
			sourceVersion: String(row.sourceVersion ?? ""),
		}
	},
}
