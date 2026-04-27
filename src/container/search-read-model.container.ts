import {
	and,
	db,
	eq,
	EffectiveAvailability,
	EffectivePricing,
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

export const searchReadModelRepository = {
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

	async loadMaterializationInputs(params: { variantId: string; ratePlanId: string; date: string }) {
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
			db
				.select({
					finalBasePrice: EffectivePricing.finalBasePrice,
				})
				.from(EffectivePricing)
				.where(
					and(
						eq(EffectivePricing.variantId, params.variantId),
						eq(EffectivePricing.ratePlanId, params.ratePlanId),
						eq(EffectivePricing.date, params.date)
					)
				)
				.get(),
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
			db
				.select({ computedAt: EffectivePricing.computedAt })
				.from(EffectivePricing)
				.where(
					and(
						eq(EffectivePricing.variantId, params.variantId),
						eq(EffectivePricing.ratePlanId, params.ratePlanId),
						eq(EffectivePricing.date, params.date)
					)
				)
				.get(),
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
