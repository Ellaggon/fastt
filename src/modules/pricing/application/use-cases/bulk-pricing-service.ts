import { logger } from "@/lib/observability/logger"
import { normalizedPricingRuleCommandFromPayload } from "@/lib/pricing/rules-v2"
import { getRatePlanOwnerContext } from "./get-rateplan-owner-context"
import { PricingRuleCommandError, type PricingRuleContext } from "./pricing-rule-command-service"
import {
	pricingRulePayloadFromBulkOperation,
	type BulkPricingOperation,
} from "./pricing-bulk-command"

async function resolveRatePlanOwnerContext(ratePlanId: string) {
	const { ratePlanOwnerContextRepository } = await import("@/container/pricing.container")
	return getRatePlanOwnerContext({ repo: ratePlanOwnerContextRepository }, { ratePlanId })
}

async function getPricingRuleCommandService() {
	const { pricingRuleCommandService } = await import("@/container/pricing.container")
	return pricingRuleCommandService
}

type JsonRecord = Record<string, unknown>

export type { BulkPricingOperation } from "./pricing-bulk-command"

export type BulkPricingInput = {
	ratePlanIds: string[]
	operation: BulkPricingOperation
	dryRun?: boolean
	concurrency?: number
}

type BulkPreviewSuccess = {
	ratePlanId: string
	ok: true
	currentRuleCount: number
	preview: {
		basePrice: number
		currency: string
		dateRange: {
			from: string | null
			to: string | null
			fromDayOfWeekLabel: string | null
			toDayOfWeekLabel: string | null
			totalDays: number
		}
		priceSummary: {
			before: { avg: number; min: number; max: number }
			after: { avg: number; min: number; max: number }
		}
		breakdown: {
			weekdays: {
				days: number
				changedDays: number
				totalDelta: number
			}
			weekends: {
				days: number
				changedDays: number
				totalDelta: number
			}
			daysWithoutCoverage: number
		}
		days: Array<{
			date: string
			dayOfWeek: number
			dayOfWeekLabel: string
			before: number
			after: number
			delta: number
			appliedRuleIds: string[]
			hasCoverage: boolean
		}>
	}
	diff: {
		changedDays: number
		totalDelta: number
		averageDelta: number
	}
	businessMetrics: {
		averageNightlyChange: number
		estimatedRevenueImpact: number
	}
}

type BulkFailure = {
	ratePlanId: string
	ok: false
	stage: "list" | "preview" | "create" | "generate"
	status: number
	error: string
	body?: unknown
}

type BulkApplySuccess = {
	ratePlanId: string
	ok: true
	ruleId: string
	daysGenerated: number
	diff: BulkPreviewSuccess["diff"] | null
}

export type BulkPreviewResult = {
	mode: "preview"
	summary: {
		total: number
		success: number
		failed: number
	}
	results: BulkPreviewSuccess[]
	failures: BulkFailure[]
}

export type BulkApplyResult = {
	mode: "apply"
	dryRun: boolean
	summary: {
		total: number
		success: number
		failed: number
	}
	results: BulkApplySuccess[]
	failures: BulkFailure[]
}

type BulkPreviewDay = BulkPreviewSuccess["preview"]["days"][number]

function clampConcurrency(value: unknown): number {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return 4
	return Math.max(1, Math.min(10, Math.trunc(parsed)))
}

async function mapLimit<T, R>(
	items: T[],
	limit: number,
	handler: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const resolvedLimit = Math.max(1, Math.min(limit, items.length || 1))
	const out: R[] = new Array(items.length)
	let cursor = 0
	const workers = Array.from({ length: resolvedLimit }, async () => {
		while (true) {
			const index = cursor++
			if (index >= items.length) return
			out[index] = await handler(items[index], index)
		}
	})
	await Promise.all(workers)
	return out
}

function buildPreviewPayload(ratePlanId: string, operation: BulkPricingOperation): JsonRecord {
	return { ratePlanId, ...pricingRulePayloadFromBulkOperation(operation) }
}

function buildCreatePayload(ratePlanId: string, operation: BulkPricingOperation): JsonRecord {
	const payload = pricingRulePayloadFromBulkOperation(operation)
	return {
		ratePlanId,
		...payload,
		previewFrom: undefined,
		previewDays: undefined,
	}
}

function toBulkFailure(
	ratePlanId: string,
	stage: BulkFailure["stage"],
	status: number,
	body: unknown
): BulkFailure {
	const message =
		body && typeof body === "object" && "error" in body
			? String((body as any).error ?? "unknown_error")
			: "unknown_error"
	return {
		ratePlanId,
		ok: false,
		stage,
		status,
		error: message,
		body,
	}
}

const DAY_NAMES_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const

function computePriceStats(values: number[]): { avg: number; min: number; max: number } {
	if (!values.length) return { avg: 0, min: 0, max: 0 }
	const min = Math.min(...values)
	const max = Math.max(...values)
	const avg = values.reduce((acc, value) => acc + value, 0) / values.length
	return {
		avg: Number(avg.toFixed(2)),
		min: Number(min.toFixed(2)),
		max: Number(max.toFixed(2)),
	}
}

async function runPreviewForRatePlan(
	providerId: string,
	ratePlanId: string,
	operation: BulkPricingOperation,
	resolvedContext?: PricingRuleContext
): Promise<BulkPreviewSuccess | BulkFailure> {
	let context = resolvedContext
	if (!context) {
		const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
		if (!ownerContext || ownerContext.providerId !== providerId) {
			return toBulkFailure(ratePlanId, "list", 404, { error: "ratePlan_not_found" })
		}
		context = { ...ownerContext, providerId }
	}
	let previewBody: any
	try {
		previewBody = await (
			await getPricingRuleCommandService()
		).previewCandidate(
			context,
			normalizedPricingRuleCommandFromPayload(buildPreviewPayload(ratePlanId, operation))
		)
	} catch (error) {
		logger.warn("bulk_pricing_preview_failed", {
			ratePlanId,
			error: error instanceof Error ? error.message : String(error),
		})
		return toBulkFailure(
			ratePlanId,
			"preview",
			error instanceof PricingRuleCommandError ? error.status : 500,
			{
				error: error instanceof PricingRuleCommandError ? error.code : "preview_failed",
			}
		)
	}
	const currentRuleCount = Number(previewBody.currentRuleCount ?? 0)
	const rawDays = Array.isArray(previewBody?.days) ? previewBody.days : []
	const days = rawDays.map((day: any) => {
		const date = String(day?.date ?? "")
		const parsedDate = new Date(`${date}T00:00:00.000Z`)
		const dayOfWeek = Number.isNaN(parsedDate.getTime()) ? -1 : parsedDate.getUTCDay()
		const hasCoverage = Array.isArray(day?.appliedRuleIds)
			? day.appliedRuleIds.map((id: unknown) => String(id)).includes("__candidate__")
			: false
		return {
			date,
			dayOfWeek,
			dayOfWeekLabel: dayOfWeek >= 0 && dayOfWeek <= 6 ? DAY_NAMES_ES[dayOfWeek] : "—",
			before: Number(day?.before ?? 0),
			after: Number(day?.after ?? 0),
			delta: Number(day?.delta ?? 0),
			appliedRuleIds: Array.isArray(day?.appliedRuleIds)
				? day.appliedRuleIds.map((id: unknown) => String(id))
				: [],
			hasCoverage,
		}
	})
	const changedDays = days.filter((day: BulkPreviewDay) => Number(day.delta) !== 0).length
	const totalDelta = Number(
		days.reduce((acc: number, day: BulkPreviewDay) => acc + Number(day.delta ?? 0), 0).toFixed(2)
	)
	const averageDelta = Number((days.length > 0 ? totalDelta / days.length : 0).toFixed(2))
	const beforeValues = days.map((day: BulkPreviewDay) => Number(day.before))
	const afterValues = days.map((day: BulkPreviewDay) => Number(day.after))
	const weekdays = days.filter((day: BulkPreviewDay) => day.dayOfWeek >= 1 && day.dayOfWeek <= 5)
	const weekends = days.filter((day: BulkPreviewDay) => day.dayOfWeek === 0 || day.dayOfWeek === 6)
	const dateRange = {
		from: days.length ? days[0].date : null,
		to: days.length ? days[days.length - 1].date : null,
		fromDayOfWeekLabel: days.length ? days[0].dayOfWeekLabel : null,
		toDayOfWeekLabel: days.length ? days[days.length - 1].dayOfWeekLabel : null,
		totalDays: days.length,
	}
	return {
		ratePlanId,
		ok: true,
		currentRuleCount,
		preview: {
			basePrice: Number(previewBody?.basePrice ?? 0),
			currency: String(previewBody?.currency ?? ""),
			dateRange,
			priceSummary: {
				before: computePriceStats(beforeValues),
				after: computePriceStats(afterValues),
			},
			breakdown: {
				weekdays: {
					days: weekdays.length,
					changedDays: weekdays.filter((day: BulkPreviewDay) => Number(day.delta) !== 0).length,
					totalDelta: Number(
						weekdays
							.reduce((acc: number, day: BulkPreviewDay) => acc + Number(day.delta), 0)
							.toFixed(2)
					),
				},
				weekends: {
					days: weekends.length,
					changedDays: weekends.filter((day: BulkPreviewDay) => Number(day.delta) !== 0).length,
					totalDelta: Number(
						weekends
							.reduce((acc: number, day: BulkPreviewDay) => acc + Number(day.delta), 0)
							.toFixed(2)
					),
				},
				daysWithoutCoverage: days.filter((day: BulkPreviewDay) => !day.hasCoverage).length,
			},
			days,
		},
		diff: {
			changedDays,
			totalDelta,
			averageDelta,
		},
		businessMetrics: {
			averageNightlyChange: averageDelta,
			estimatedRevenueImpact: totalDelta,
		},
	}
}

export async function simulateBulkOperation(params: {
	providerId: string
	input: BulkPricingInput
}): Promise<BulkPreviewResult> {
	const providerId = String(params.providerId ?? "").trim()
	if (!providerId) throw new PricingRuleCommandError("provider_required", 400)
	const ratePlanIds = Array.from(
		new Set((params.input.ratePlanIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))
	)
	const concurrency = clampConcurrency(params.input.concurrency)
	const results = await mapLimit(ratePlanIds, concurrency, async (ratePlanId) =>
		runPreviewForRatePlan(providerId, ratePlanId, params.input.operation)
	)
	const successes = results.filter((item): item is BulkPreviewSuccess => item.ok)
	const failures = results.filter((item): item is BulkFailure => !item.ok)
	if (failures.length) {
		logger.warn("bulk_pricing_preview_partial_failure", {
			total: ratePlanIds.length,
			failed: failures.length,
			failureRatePlanIds: failures.map((item) => item.ratePlanId),
		})
	}
	return {
		mode: "preview",
		summary: {
			total: ratePlanIds.length,
			success: successes.length,
			failed: failures.length,
		},
		results: successes,
		failures,
	}
}

export async function applyBulkOperation(params: {
	providerId: string
	input: BulkPricingInput
}): Promise<BulkApplyResult> {
	const input = params.input
	if (input.dryRun) {
		const preview = await simulateBulkOperation(params)
		return {
			mode: "apply",
			dryRun: true,
			summary: preview.summary,
			results: preview.results.map((item) => ({
				ratePlanId: item.ratePlanId,
				ok: true,
				ruleId: "__dry_run__",
				daysGenerated: 0,
				diff: item.diff,
			})),
			failures: preview.failures,
		}
	}

	const ratePlanIds = Array.from(
		new Set(input.ratePlanIds.map((id) => String(id ?? "").trim()).filter(Boolean))
	)
	const providerId = String(params.providerId ?? "").trim()
	if (!providerId) throw new PricingRuleCommandError("provider_required", 400)
	const concurrency = clampConcurrency(input.concurrency)
	const perRatePlan = await mapLimit(ratePlanIds, concurrency, async (ratePlanId) => {
		const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
		if (!ownerContext || ownerContext.providerId !== providerId) {
			return toBulkFailure(ratePlanId, "list", 404, { error: "ratePlan_not_found" })
		}
		const context: PricingRuleContext = { ...ownerContext, providerId }
		const preview = await runPreviewForRatePlan(providerId, ratePlanId, input.operation, context)
		if (!preview.ok) return preview
		let createdBody: any
		try {
			createdBody = await (
				await getPricingRuleCommandService()
			).createRule(
				context,
				normalizedPricingRuleCommandFromPayload(buildCreatePayload(ratePlanId, input.operation))
			)
		} catch (error) {
			return toBulkFailure(
				ratePlanId,
				"create",
				error instanceof PricingRuleCommandError ? error.status : 500,
				{
					error: error instanceof PricingRuleCommandError ? error.code : "create_failed",
				}
			)
		}

		return {
			ratePlanId,
			ok: true,
			ruleId: String(createdBody?.ruleId ?? ""),
			daysGenerated: Number(createdBody?.rematerialization?.generatedDatesCount ?? 0),
			diff: preview.diff,
		} as BulkApplySuccess
	})

	const successes = perRatePlan.filter((item): item is BulkApplySuccess => item.ok)
	const failures = perRatePlan.filter((item): item is BulkFailure => !item.ok)
	if (failures.length) {
		logger.warn("bulk_pricing_apply_partial_failure", {
			total: ratePlanIds.length,
			failed: failures.length,
			failureRatePlanIds: failures.map((item) => item.ratePlanId),
		})
	}
	return {
		mode: "apply",
		dryRun: false,
		summary: {
			total: ratePlanIds.length,
			success: successes.length,
			failed: failures.length,
		},
		results: successes,
		failures,
	}
}
