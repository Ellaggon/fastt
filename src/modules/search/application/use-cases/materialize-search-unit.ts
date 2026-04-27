import { z } from "zod"

import { logger } from "@/lib/observability/logger"
import { getFeatureFlag } from "@/config/featureFlags"
import {
	normalizePolicyResolutionResult,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { buildOccupancyKey } from "../../domain/occupancy-key"
import type { SearchUnitMaterializationRepositoryPort } from "../ports/SearchUnitMaterializationRepositoryPort"
export {
	SEARCH_VIEW_REASON_CODES,
	SEARCH_VIEW_SLA,
	evaluateSearchViewState,
	type SearchViewReasonCode,
	type SearchViewStateEvaluation,
	type EvaluateSearchViewStateInput,
} from "./search-view-governance"
import { SEARCH_VIEW_REASON_CODES, evaluateSearchViewState } from "./search-view-governance"

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

let searchUnitMaterializationRepository: SearchUnitMaterializationRepositoryPort | null = null

export function configureSearchUnitMaterializationRepository(
	repository: SearchUnitMaterializationRepositoryPort
): void {
	searchUnitMaterializationRepository = repository
}

function resolveRepository(): SearchUnitMaterializationRepositoryPort {
	if (!searchUnitMaterializationRepository) {
		throw new Error("SEARCH_UNIT_MATERIALIZATION_REPOSITORY_NOT_CONFIGURED")
	}
	return searchUnitMaterializationRepository
}

function parseDateOnly(value: string): Date {
	const raw = String(value ?? "").trim()
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
	if (!match) throw new Error(`INVALID_DATE_ONLY:${raw}`)
	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	const parsed = new Date(Date.UTC(year, month - 1, day))
	if (toISODateOnly(parsed) !== raw) {
		throw new Error(`INVALID_DATE_ONLY:${raw}`)
	}
	return parsed
}

function toISODateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function enumerateDates(from: string, to: string): string[] {
	const normalizedFrom = toISODateOnly(parseDateOnly(from))
	const normalizedTo = toISODateOnly(parseDateOnly(to))
	const out: string[] = []
	const cursor = parseDateOnly(normalizedFrom)
	const end = parseDateOnly(normalizedTo)
	if (cursor >= end) return out
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

function hasGapReason(blocker: string | null): boolean {
	return (
		blocker === SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE ||
		blocker === SEARCH_VIEW_REASON_CODES.PARTIAL_COVERAGE
	)
}

function hasMaterializationDrift(params: {
	existing: Awaited<ReturnType<SearchUnitMaterializationRepositoryPort["getSearchUnitViewRow"]>>
	candidate: {
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
		sourceVersion: string
	}
}): boolean {
	const current = params.existing
	if (!current) return true
	const next = params.candidate
	return (
		current.variantId !== next.variantId ||
		current.ratePlanId !== next.ratePlanId ||
		current.date !== next.date ||
		current.occupancyKey !== next.occupancyKey ||
		current.totalGuests !== next.totalGuests ||
		current.hasAvailability !== next.hasAvailability ||
		current.hasPrice !== next.hasPrice ||
		current.isSellable !== next.isSellable ||
		current.isAvailable !== next.isAvailable ||
		current.availableUnits !== next.availableUnits ||
		current.stopSell !== next.stopSell ||
		(current.pricePerNight ?? null) !== (next.pricePerNight ?? null) ||
		current.currency !== next.currency ||
		(current.primaryBlocker ?? null) !== (next.primaryBlocker ?? null) ||
		(current.minStay ?? null) !== (next.minStay ?? null) ||
		current.cta !== next.cta ||
		current.ctd !== next.ctd ||
		current.sourceVersion !== next.sourceVersion
	)
}

export async function materializeSearchUnit(
	input: MaterializeSearchUnitInput
): Promise<{ updated: boolean; isSellable: boolean; blocker: string | null }> {
	const repository = resolveRepository()
	const parsed = materializeSearchUnitSchema.parse(input)
	const normalizedDate = toISODateOnly(parseDateOnly(parsed.date))
	const productId = await repository.resolveProductId(parsed.variantId)
	if (!productId) {
		return { updated: false, isSellable: false, blocker: "MISSING_VARIANT" }
	}

	const { availabilityRow, pricingRow, restrictionRow } =
		await repository.loadMaterializationInputs({
			variantId: parsed.variantId,
			ratePlanId: parsed.ratePlanId,
			date: normalizedDate,
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
	const hasRestriction = restrictionRow != null

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
				checkIn: normalizedDate,
				requiredCategories: [...REQUIRED_POLICY_CATEGORIES],
				onMissingCategory: "return_null",
			})
			const normalized = normalizePolicyResolutionResult(resolvedPolicies, {
				asOfDate: normalizedDate,
				warnings: [],
			}).dto
			policyBlocked = normalized.missingCategories.length > 0
		} catch (error) {
			logger.warn("search.materialize.policy_resolution_failed", {
				variantId: parsed.variantId,
				ratePlanId: parsed.ratePlanId,
				date: normalizedDate,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}

	const blocker = !hasAvailability
		? SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE
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
	const sourceVersion = await repository.resolveSourceVersion({
		variantId: parsed.variantId,
		ratePlanId: parsed.ratePlanId,
		date: normalizedDate,
	})
	const candidateRow = {
		variantId: parsed.variantId,
		productId,
		ratePlanId: parsed.ratePlanId,
		date: normalizedDate,
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
		sourceVersion,
	}
	const existingRow = await repository.getSearchUnitViewRow({
		variantId: parsed.variantId,
		ratePlanId: parsed.ratePlanId,
		date: normalizedDate,
		occupancyKey,
	})
	if (!hasMaterializationDrift({ existing: existingRow, candidate: candidateRow })) {
		return {
			updated: false,
			isSellable: candidateRow.isSellable,
			blocker,
		}
	}

	await repository.upsertSearchUnitViewRow({
		id: stableId({
			variantId: parsed.variantId,
			ratePlanId: parsed.ratePlanId,
			date: normalizedDate,
			occupancyKey,
		}),
		...candidateRow,
		computedAt: new Date(),
	})

	return {
		updated: true,
		isSellable: candidateRow.isSellable,
		blocker,
	}
}

export async function materializeSearchUnitRange(
	input: MaterializeSearchUnitRangeInput
): Promise<{ rows: number; variantId: string; from: string; to: string }> {
	const repository = resolveRepository()
	const parsed = materializeSearchUnitRangeSchema.parse(input)
	const normalizedFrom = toISODateOnly(parseDateOnly(parsed.from))
	const normalizedTo = toISODateOnly(parseDateOnly(parsed.to))
	const dates = enumerateDates(parsed.from, parsed.to)
	if (dates.length === 0) {
		return { rows: 0, variantId: parsed.variantId, from: normalizedFrom, to: normalizedTo }
	}

	const ratePlanIds = parsed.ratePlanId
		? [parsed.ratePlanId]
		: await repository.resolveDefaultRatePlanIds(parsed.variantId)
	const normalizedRatePlanIds = [
		...new Set(ratePlanIds.map((id) => String(id).trim()).filter(Boolean)),
	].sort((a, b) => a.localeCompare(b))
	if (!normalizedRatePlanIds.length) {
		logger.warn("search_unit_view_materialization_skipped", {
			variantId: parsed.variantId,
			reason: "missing_default_rateplan",
			from: normalizedFrom,
			to: normalizedTo,
		})
		return { rows: 0, variantId: parsed.variantId, from: normalizedFrom, to: normalizedTo }
	}

	const guestRange = [...new Set(await repository.resolveGuestRange(parsed.variantId))]
		.map((value) => Number(value))
		.filter((value) => Number.isInteger(value) && value > 0)
		.sort((a, b) => a - b)
	let rows = 0
	let coveredRows = 0
	let gapRows = 0
	for (const ratePlanId of normalizedRatePlanIds) {
		for (const date of dates) {
			for (const totalGuests of guestRange) {
				const result = await materializeSearchUnit({
					variantId: parsed.variantId,
					ratePlanId,
					date,
					totalGuests,
					currency: parsed.currency,
				})
				if (hasGapReason(result.blocker)) gapRows += 1
				else coveredRows += 1
				rows += 1
			}
		}
	}
	const rangeState = evaluateSearchViewState({
		totalExpectedRows: rows,
		coveredRows,
		lastMaterializedAt: null,
	})

	logger.info("search_unit_view_materialized_range", {
		variantId: parsed.variantId,
		ratePlanIds: normalizedRatePlanIds,
		from: normalizedFrom,
		to: normalizedTo,
		rows,
		coveredRows,
		gapRows,
		coverageRatio: rangeState.coverageRatio,
		coverageReasons: rangeState.reasonCodes,
	})

	return { rows, variantId: parsed.variantId, from: normalizedFrom, to: normalizedTo }
}

export async function purgeStaleSearchUnitRows(params?: {
	maxAgeMinutes?: number
}): Promise<{ removed: number; maxAgeMinutes: number }> {
	const repository = resolveRepository()
	const maxAgeMinutes = Math.max(1, Number(params?.maxAgeMinutes ?? 30))
	const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000)
	const removed = await repository.purgeStaleSearchUnitRows(cutoff)
	logger.info("search_unit_view_purged_stale_rows", {
		removed,
		maxAgeMinutes,
		cutoff,
	})
	return { removed, maxAgeMinutes }
}
