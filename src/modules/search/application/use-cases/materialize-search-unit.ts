import {
	and,
	db,
	eq,
	EffectiveAvailability,
	EffectivePricing,
	EffectiveRestriction,
	gte,
	lt,
	RatePlan,
	SearchUnitView,
	sql,
	Variant,
	VariantCapacity,
} from "astro:db"
import { createHash } from "node:crypto"
import { z } from "zod"

import { logger } from "@/lib/observability/logger"
import { buildOccupancyKey } from "../../domain/occupancy-key"

const materializeSearchUnitSchema = z.object({
	variantId: z.string().min(1),
	ratePlanId: z.string().min(1),
	date: z.string().min(1),
	totalGuests: z.number().int().min(1),
	currency: z.string().min(1).default("USD"),
})

const materializeSearchUnitRangeSchema = z.object({
	variantId: z.string().min(1),
	ratePlanId: z.string().min(1).optional(),
	from: z.string().min(1),
	to: z.string().min(1),
	currency: z.string().min(1).default("USD"),
})

type MaterializeSearchUnitInput = z.infer<typeof materializeSearchUnitSchema>
type MaterializeSearchUnitRangeInput = z.infer<typeof materializeSearchUnitRangeSchema>

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function toISODateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function enumerateDates(from: string, to: string): string[] {
	const out: string[] = []
	const cursor = parseDateOnly(from)
	const end = parseDateOnly(to)
	while (cursor < end) {
		out.push(toISODateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function stableId(params: {
	variantId: string
	ratePlanId: string
	date: string
	occupancyKey: string
}): string {
	return `suv_${params.variantId}_${params.ratePlanId}_${params.date}_${params.occupancyKey}`
}

async function resolveDefaultRatePlanIds(variantId: string): Promise<string[]> {
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
}

async function resolveProductId(variantId: string): Promise<string | null> {
	const row = await db
		.select({ productId: Variant.productId })
		.from(Variant)
		.where(eq(Variant.id, variantId))
		.get()
	return row?.productId ? String(row.productId) : null
}

async function resolveGuestRange(variantId: string): Promise<number[]> {
	const capacity = await db
		.select({ maxOccupancy: VariantCapacity.maxOccupancy })
		.from(VariantCapacity)
		.where(eq(VariantCapacity.variantId, variantId))
		.get()
	const maxOccupancy = Math.max(1, Number(capacity?.maxOccupancy ?? 2))
	return Array.from({ length: maxOccupancy }, (_, i) => i + 1)
}

async function resolveSourceVersion(params: {
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
	const a = availabilityRow?.computedAt ? new Date(availabilityRow.computedAt).toISOString() : "na"
	const p = pricingRow?.computedAt ? new Date(pricingRow.computedAt).toISOString() : "np"
	const restrictionTimestamp =
		restrictionRow?.computedAt != null
			? new Date(restrictionRow.computedAt).toISOString()
			: (restrictionRow as any)?.updatedAt != null
				? new Date((restrictionRow as any).updatedAt).toISOString()
				: "nr"
	return createHash("sha1").update(`${a}|${p}|${restrictionTimestamp}`).digest("hex")
}

export async function materializeSearchUnit(
	input: MaterializeSearchUnitInput
): Promise<{ updated: boolean; isSellable: boolean; blocker: string | null }> {
	const parsed = materializeSearchUnitSchema.parse(input)
	const productId = await resolveProductId(parsed.variantId)
	if (!productId) {
		return { updated: false, isSellable: false, blocker: "MISSING_VARIANT" }
	}

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
					eq(EffectiveAvailability.variantId, parsed.variantId),
					eq(EffectiveAvailability.date, parsed.date)
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
					eq(EffectivePricing.variantId, parsed.variantId),
					eq(EffectivePricing.ratePlanId, parsed.ratePlanId),
					eq(EffectivePricing.date, parsed.date)
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
					eq(EffectiveRestriction.variantId, parsed.variantId),
					eq(EffectiveRestriction.date, parsed.date)
				)
			)
			.get(),
	])

	const hasAvailability = availabilityRow != null
	const hasPrice =
		pricingRow?.finalBasePrice != null && Number.isFinite(Number(pricingRow.finalBasePrice))
	const availableUnits = Math.max(0, Number(availabilityRow?.availableUnits ?? 0))
	const stopSell = Boolean(
		restrictionRow?.stopSell ?? (hasAvailability ? availabilityRow.stopSell : true)
	)
	const minStay =
		restrictionRow?.minStay == null ? null : Math.max(1, Number(restrictionRow.minStay))
	const cta = Boolean(restrictionRow?.cta ?? false)
	const ctd = Boolean(restrictionRow?.ctd ?? false)

	const isSellable = hasAvailability && hasPrice && !stopSell && availableUnits > 0
	const isAvailable = hasAvailability && !stopSell && availableUnits > 0

	const blocker = !hasAvailability
		? "UNKNOWN"
		: stopSell
			? "STOP_SELL"
			: availableUnits <= 0
				? "NO_CAPACITY"
				: !hasPrice
					? "MISSING_PRICE"
					: null
	const occupancyKey = buildOccupancyKey({
		rooms: 1,
		adults: parsed.totalGuests,
		children: 0,
		totalGuests: parsed.totalGuests,
	})
	const sourceVersion = await resolveSourceVersion({
		variantId: parsed.variantId,
		ratePlanId: parsed.ratePlanId,
		date: parsed.date,
	})

	await db
		.insert(SearchUnitView)
		.values({
			id: stableId({
				variantId: parsed.variantId,
				ratePlanId: parsed.ratePlanId,
				date: parsed.date,
				occupancyKey,
			}),
			variantId: parsed.variantId,
			productId,
			ratePlanId: parsed.ratePlanId,
			date: parsed.date,
			occupancyKey,
			totalGuests: parsed.totalGuests,
			hasAvailability,
			hasPrice,
			isSellable,
			isAvailable,
			availableUnits,
			stopSell,
			pricePerNight: hasPrice ? Number(pricingRow?.finalBasePrice ?? 0) : null,
			currency: parsed.currency,
			primaryBlocker: blocker,
			minStay,
			cta,
			ctd,
			computedAt: new Date(),
			sourceVersion,
		} as any)
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

	return {
		updated: true,
		isSellable,
		blocker,
	}
}

export async function materializeSearchUnitRange(
	input: MaterializeSearchUnitRangeInput
): Promise<{ rows: number; variantId: string; from: string; to: string }> {
	const parsed = materializeSearchUnitRangeSchema.parse(input)
	const dates = enumerateDates(parsed.from, parsed.to)
	if (dates.length === 0) {
		return { rows: 0, variantId: parsed.variantId, from: parsed.from, to: parsed.to }
	}

	const ratePlanIds = parsed.ratePlanId
		? [parsed.ratePlanId]
		: await resolveDefaultRatePlanIds(parsed.variantId)
	if (!ratePlanIds.length) {
		logger.warn("search_unit_view_materialization_skipped", {
			variantId: parsed.variantId,
			reason: "missing_default_rateplan",
			from: parsed.from,
			to: parsed.to,
		})
		return { rows: 0, variantId: parsed.variantId, from: parsed.from, to: parsed.to }
	}

	const guestRange = await resolveGuestRange(parsed.variantId)
	let rows = 0
	for (const ratePlanId of ratePlanIds) {
		for (const date of dates) {
			for (const totalGuests of guestRange) {
				await materializeSearchUnit({
					variantId: parsed.variantId,
					ratePlanId,
					date,
					totalGuests,
					currency: parsed.currency,
				})
				rows += 1
			}
		}
	}

	logger.info("search_unit_view_materialized_range", {
		variantId: parsed.variantId,
		ratePlanIds,
		from: parsed.from,
		to: parsed.to,
		rows,
	})

	return { rows, variantId: parsed.variantId, from: parsed.from, to: parsed.to }
}

export async function purgeStaleSearchUnitRows(params?: {
	maxAgeMinutes?: number
}): Promise<{ removed: number; maxAgeMinutes: number }> {
	const maxAgeMinutes = Math.max(1, Number(params?.maxAgeMinutes ?? 30))
	const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000)
	const result = await db.delete(SearchUnitView).where(lt(SearchUnitView.computedAt, cutoff)).run()
	const removed = Number((result as any)?.rowsAffected ?? 0)
	logger.info("search_unit_view_purged_stale_rows", {
		removed,
		maxAgeMinutes,
		cutoff,
	})
	return { removed, maxAgeMinutes }
}
