import { z } from "zod"

import { logger } from "@/lib/observability/logger"
import { getFeatureFlag } from "@/config/featureFlags"
import {
	normalizePolicyResolutionResult,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { searchReadModelRepository } from "@/container/search-read-model.container"
import { buildOccupancyKey } from "../../domain/occupancy-key"
export {
	SEARCH_VIEW_REASON_CODES,
	SEARCH_VIEW_SLA,
	evaluateSearchViewState,
	type SearchViewReasonCode,
	type SearchViewStateEvaluation,
	type EvaluateSearchViewStateInput,
} from "./search-view-governance"

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

const REQUIRED_POLICY_CATEGORIES = ["Cancellation", "Payment", "NoShow", "CheckIn"] as const

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

export async function materializeSearchUnit(
	input: MaterializeSearchUnitInput
): Promise<{ updated: boolean; isSellable: boolean; blocker: string | null }> {
	const parsed = materializeSearchUnitSchema.parse(input)
	const productId = await searchReadModelRepository.resolveProductId(parsed.variantId)
	if (!productId) {
		return { updated: false, isSellable: false, blocker: "MISSING_VARIANT" }
	}

	const { availabilityRow, pricingRow, restrictionRow } =
		await searchReadModelRepository.loadMaterializationInputs({
			variantId: parsed.variantId,
			ratePlanId: parsed.ratePlanId,
			date: parsed.date,
		})

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

	let policyBlocked = false
	const policyBlockerEnabled = getFeatureFlag("SEARCH_POLICY_BLOCKER_ENABLED")
	if (policyBlockerEnabled && isSellable) {
		try {
			const resolvedPolicies = await resolveEffectivePolicies({
				productId,
				variantId: parsed.variantId,
				ratePlanId: parsed.ratePlanId,
				checkIn: parsed.date,
				requiredCategories: [...REQUIRED_POLICY_CATEGORIES],
				onMissingCategory: "return_null",
			})
			const normalized = normalizePolicyResolutionResult(resolvedPolicies, {
				asOfDate: parsed.date,
				warnings: [],
			}).dto
			policyBlocked = normalized.missingCategories.length > 0
		} catch (error) {
			logger.warn("search.materialize.policy_resolution_failed", {
				variantId: parsed.variantId,
				ratePlanId: parsed.ratePlanId,
				date: parsed.date,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}

	const blocker = !hasAvailability
		? "UNKNOWN"
		: stopSell
			? "STOP_SELL"
			: availableUnits <= 0
				? "NO_CAPACITY"
				: !hasPrice
					? "MISSING_PRICE"
					: policyBlocked
						? "POLICY_BLOCKED"
						: null
	const occupancyKey = buildOccupancyKey({
		rooms: 1,
		adults: parsed.totalGuests,
		children: 0,
		totalGuests: parsed.totalGuests,
	})
	const sourceVersion = await searchReadModelRepository.resolveSourceVersion({
		variantId: parsed.variantId,
		ratePlanId: parsed.ratePlanId,
		date: parsed.date,
	})

	await searchReadModelRepository.upsertSearchUnitViewRow({
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
		isSellable: isSellable && !policyBlocked,
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
	})

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
		: await searchReadModelRepository.resolveDefaultRatePlanIds(parsed.variantId)
	if (!ratePlanIds.length) {
		logger.warn("search_unit_view_materialization_skipped", {
			variantId: parsed.variantId,
			reason: "missing_default_rateplan",
			from: parsed.from,
			to: parsed.to,
		})
		return { rows: 0, variantId: parsed.variantId, from: parsed.from, to: parsed.to }
	}

	const guestRange = await searchReadModelRepository.resolveGuestRange(parsed.variantId)
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
	const removed = await searchReadModelRepository.purgeStaleSearchUnitRows(cutoff)
	logger.info("search_unit_view_purged_stale_rows", {
		removed,
		maxAgeMinutes,
		cutoff,
	})
	return { removed, maxAgeMinutes }
}
