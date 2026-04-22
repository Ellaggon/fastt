import { logger } from "@/lib/observability/logger"
import { DailyInventoryRepository } from "../../infrastructure/repositories/DailyInventoryRepository"
import {
	mapV2ToLegacyInput,
	type BulkInventoryOperationInputV2,
} from "../mappers/map-v2-to-legacy-input"

import { applyInventoryMutation } from "./apply-inventory-mutation"

const dailyInventoryRepository = new DailyInventoryRepository()

export type BulkInventoryOperationType = "open_sales" | "close_sales" | "set_inventory"

export type BulkInventoryInput = {
	variantId: string
	dateFrom: string
	dateTo: string
	daysOfWeek?: number[]
	operation: {
		type: BulkInventoryOperationType
		value?: number
	}
}

export type BulkInventoryDay = {
	variantId?: string
	date: string
	before: {
		stopSell: boolean
		totalUnits: number
		state: "open" | "closed"
	}
	after: {
		stopSell: boolean
		totalUnits: number
		state: "open" | "closed"
	}
	changed: boolean
}

export type BulkInventorySummary = {
	totalDaysInRange: number
	targetDays: number
	changedDays: number
	resultingOpenDays: number
	resultingClosedDays: number
	totalCapacityDelta: number
}

export type BulkInventorySummaryAggregated = BulkInventorySummary & {
	variantsTotal: number
	variantsWithChanges: number
}

type BulkExecutionMode = "legacy" | "v2"

export type BulkInventoryPreviewResult = {
	mode: "preview"
	variantId: string
	range: {
		dateFrom: string
		dateTo: string
	}
	operation: BulkInventoryInput["operation"]
	summary: BulkInventorySummary
	days: BulkInventoryDay[]
	summaryAggregated?: BulkInventorySummaryAggregated
	units?: Array<{
		variantId: string
		range: {
			dateFrom: string
			dateTo: string
		}
		operation: BulkInventoryInput["operation"]
		summary: BulkInventorySummary
		days: BulkInventoryDay[]
	}>
	context?: {
		mode: BulkExecutionMode
		dryRun: boolean
		source?: string | null
	}
}

type BulkInventoryFailure = {
	date: string
	error: string
}

export type BulkInventoryApplyResult = {
	mode: "apply"
	variantId: string
	range: {
		dateFrom: string
		dateTo: string
	}
	operation: BulkInventoryInput["operation"]
	summary: BulkInventorySummary & {
		successfulDays: number
		failedDays: number
	}
	days: BulkInventoryDay[]
	failures: BulkInventoryFailure[]
	summaryAggregated?:
		| (BulkInventorySummary & {
				successfulDays: number
				failedDays: number
				variantsTotal: number
				variantsWithChanges: number
		  })
		| null
	units?: Array<{
		variantId: string
		range: {
			dateFrom: string
			dateTo: string
		}
		operation: BulkInventoryInput["operation"]
		summary: BulkInventorySummary & {
			successfulDays: number
			failedDays: number
		}
		days: BulkInventoryDay[]
		failures: BulkInventoryFailure[]
	}>
	context?: {
		mode: BulkExecutionMode
		dryRun: boolean
		source?: string | null
	}
}

function parseDateOnly(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim())) return null
	const date = new Date(`${value}T00:00:00.000Z`)
	return Number.isNaN(date.getTime()) ? null : date
}

function toDateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
	const next = new Date(value)
	next.setUTCDate(next.getUTCDate() + days)
	return next
}

function enumerateDates(fromIso: string, toIso: string): string[] {
	const from = parseDateOnly(fromIso)
	const to = parseDateOnly(toIso)
	if (!from || !to || to <= from) return []
	const out: string[] = []
	const cursor = new Date(from)
	while (cursor < to) {
		out.push(toDateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function buildProxyHeadersFromRequest(request: Request): Headers {
	const headers = new Headers()
	const cookie = request.headers.get("cookie")
	if (cookie) headers.set("cookie", cookie)
	const authorization = request.headers.get("authorization")
	if (authorization) headers.set("authorization", authorization)
	return headers
}

function buildCalendarRequest(
	sourceRequest: Request,
	variantId: string,
	dateFrom: string,
	dateTo: string
): Request {
	const qs = new URLSearchParams({
		variantId,
		startDate: dateFrom,
		endDate: dateTo,
	})
	return new Request(`http://localhost:4321/api/inventory/calendar?${qs.toString()}`, {
		method: "GET",
		headers: buildProxyHeadersFromRequest(sourceRequest),
	})
}

function normalizeDaysOfWeek(value?: number[]): Set<number> {
	const days = Array.isArray(value)
		? value.filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
		: []
	return new Set(days)
}

function mapOperationToProjectedDay(
	day: any,
	operation: BulkInventoryInput["operation"],
	targeted: boolean
): BulkInventoryDay {
	const beforeStopSell = Boolean(day?.stopSell ?? true)
	const beforeTotalUnits = Number(day?.totalUnits ?? day?.totalInventory ?? 0)

	let afterStopSell = beforeStopSell
	let afterTotalUnits = beforeTotalUnits

	if (targeted) {
		if (operation.type === "open_sales") afterStopSell = false
		if (operation.type === "close_sales") afterStopSell = true
		if (operation.type === "set_inventory" && Number.isFinite(operation.value)) {
			afterTotalUnits = Math.max(0, Number(operation.value))
		}
	}

	const beforeState = beforeStopSell ? "closed" : "open"
	const afterState = afterStopSell ? "closed" : "open"
	const changed = beforeStopSell !== afterStopSell || beforeTotalUnits !== afterTotalUnits

	return {
		date: String(day?.date ?? ""),
		before: {
			stopSell: beforeStopSell,
			totalUnits: beforeTotalUnits,
			state: beforeState,
		},
		after: {
			stopSell: afterStopSell,
			totalUnits: afterTotalUnits,
			state: afterState,
		},
		changed,
	}
}

function summarize(projected: BulkInventoryDay[], totalDaysInRange: number): BulkInventorySummary {
	const targetDays = projected.length
	const changedDays = projected.filter((day) => day.changed).length
	const resultingOpenDays = projected.filter((day) => day.after.state === "open").length
	const resultingClosedDays = projected.filter((day) => day.after.state === "closed").length
	const totalCapacityDelta = projected.reduce(
		(acc, day) => acc + (Number(day.after.totalUnits) - Number(day.before.totalUnits)),
		0
	)
	return {
		totalDaysInRange,
		targetDays,
		changedDays,
		resultingOpenDays,
		resultingClosedDays,
		totalCapacityDelta,
	}
}

async function loadCalendarRange(params: {
	request: Request
	variantId: string
	dateFrom: string
	dateTo: string
}): Promise<any[]> {
	const { GET: calendarGet } = await import("@/pages/api/inventory/calendar")
	const req = buildCalendarRequest(params.request, params.variantId, params.dateFrom, params.dateTo)
	const res = await calendarGet({
		request: req,
		url: new URL(req.url),
	} as any)
	if (!res.ok) {
		const txt = await res.text().catch(() => "")
		throw new Error(`calendar_load_failed:${res.status}:${txt}`)
	}
	const payload = (await res.json().catch(() => [])) as unknown
	return Array.isArray(payload) ? payload : []
}

function isTargetDay(date: string, daysOfWeek: Set<number>): boolean {
	if (daysOfWeek.size === 0) return true
	const parsed = parseDateOnly(date)
	if (!parsed) return false
	const day = parsed.getUTCDay()
	return daysOfWeek.has(day)
}

function validateBulkInput(input: BulkInventoryInput): void {
	if (!String(input.variantId ?? "").trim()) throw new Error("variantId_required")
	const from = parseDateOnly(input.dateFrom)
	const to = parseDateOnly(input.dateTo)
	if (!from || !to || to <= from) throw new Error("invalid_date_range")
	if (!input.operation?.type) throw new Error("operation_type_required")
	if (
		input.operation.type === "set_inventory" &&
		(!Number.isFinite(input.operation.value) || Number(input.operation.value) < 0)
	) {
		throw new Error("set_inventory_value_invalid")
	}
}

function normalizeInput(input: BulkInventoryInput | BulkInventoryOperationInputV2): {
	mode: BulkExecutionMode
	items: BulkInventoryInput[]
	context: { dryRun: boolean; source?: string | null }
} {
	if ("selection" in (input as any)) {
		const v2 = input as BulkInventoryOperationInputV2
		return {
			mode: "v2",
			items: mapV2ToLegacyInput(v2),
			context: {
				dryRun: Boolean(v2.context?.dryRun),
				source: v2.context?.source ?? null,
			},
		}
	}
	return {
		mode: "legacy",
		items: [input as BulkInventoryInput],
		context: { dryRun: false, source: null },
	}
}

async function simulateSingle(params: {
	request: Request
	input: BulkInventoryInput
}): Promise<BulkInventoryPreviewResult> {
	validateBulkInput(params.input)

	const rows = await loadCalendarRange({
		request: params.request,
		variantId: params.input.variantId,
		dateFrom: params.input.dateFrom,
		dateTo: params.input.dateTo,
	})
	const daysOfWeek = normalizeDaysOfWeek(params.input.daysOfWeek)
	const projected = rows
		.filter((row) => isTargetDay(String(row?.date ?? ""), daysOfWeek))
		.map((row) => mapOperationToProjectedDay(row, params.input.operation, true))
	const totalDaysInRange = enumerateDates(params.input.dateFrom, params.input.dateTo).length
	const summary = summarize(projected, totalDaysInRange)

	return {
		mode: "preview",
		variantId: params.input.variantId,
		range: {
			dateFrom: params.input.dateFrom,
			dateTo: params.input.dateTo,
		},
		operation: params.input.operation,
		summary,
		days: projected,
	}
}

function aggregatePreviewResults(results: BulkInventoryPreviewResult[]): {
	summary: BulkInventorySummaryAggregated
	days: BulkInventoryDay[]
} {
	const base: BulkInventorySummaryAggregated = {
		variantsTotal: results.length,
		variantsWithChanges: results.filter((item) => item.summary.changedDays > 0).length,
		totalDaysInRange: 0,
		targetDays: 0,
		changedDays: 0,
		resultingOpenDays: 0,
		resultingClosedDays: 0,
		totalCapacityDelta: 0,
	}
	for (const result of results) {
		base.totalDaysInRange += Number(result.summary.totalDaysInRange ?? 0)
		base.targetDays += Number(result.summary.targetDays ?? 0)
		base.changedDays += Number(result.summary.changedDays ?? 0)
		base.resultingOpenDays += Number(result.summary.resultingOpenDays ?? 0)
		base.resultingClosedDays += Number(result.summary.resultingClosedDays ?? 0)
		base.totalCapacityDelta += Number(result.summary.totalCapacityDelta ?? 0)
	}
	const days = results.flatMap((result) =>
		result.days.map((day) => ({
			...day,
			variantId: result.variantId,
		}))
	)
	return { summary: base, days }
}

export async function simulateBulkInventoryOperation(params: {
	request: Request
	input: BulkInventoryInput | BulkInventoryOperationInputV2
}): Promise<BulkInventoryPreviewResult> {
	const normalized = normalizeInput(params.input)
	const previews = await Promise.all(
		normalized.items.map((item) => simulateSingle({ request: params.request, input: item }))
	)
	const primary = previews[0]
	if (!primary) {
		throw new Error("bulk_inventory_empty_selection")
	}
	if (normalized.mode === "legacy") return primary
	const aggregated = aggregatePreviewResults(previews)
	return {
		...primary,
		summary: aggregated.summary,
		days: aggregated.days,
		summaryAggregated: aggregated.summary,
		units: previews.map((preview) => ({
			variantId: preview.variantId,
			range: preview.range,
			operation: preview.operation,
			summary: preview.summary,
			days: preview.days,
		})),
		context: {
			mode: normalized.mode,
			dryRun: normalized.context.dryRun,
			source: normalized.context.source,
		},
	}
}

async function applySingle(params: {
	request: Request
	input: BulkInventoryInput
}): Promise<BulkInventoryApplyResult> {
	const preview = await simulateSingle(params)
	const failures: BulkInventoryFailure[] = []
	let successfulDays = 0

	for (const day of preview.days) {
		if (!day.changed) {
			successfulDays += 1
			continue
		}
		try {
			await applyInventoryMutation({
				mutate: async () => {
					await dailyInventoryRepository.upsertOperational({
						variantId: params.input.variantId,
						date: day.date,
						totalInventory:
							params.input.operation.type === "set_inventory"
								? Number(day.after.totalUnits)
								: undefined,
						stopSell:
							params.input.operation.type === "set_inventory"
								? undefined
								: Boolean(day.after.stopSell),
					})
				},
				recompute: {
					variantId: params.input.variantId,
					from: day.date,
					to: toDateOnly(addDays(new Date(`${day.date}T00:00:00.000Z`), 1)),
					reason: "inventory_bulk_apply",
					idempotencyKey: `inventory_bulk_apply:${params.input.variantId}:${day.date}:${params.input.operation.type}:${String(params.input.operation.value ?? "na")}`,
				},
				logContext: {
					action: "inventory_bulk_apply",
					variantId: params.input.variantId,
					date: day.date,
				},
			})
			successfulDays += 1
		} catch (error) {
			failures.push({
				date: day.date,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	if (failures.length > 0) {
		logger.warn("inventory_bulk_apply_partial_failure", {
			variantId: params.input.variantId,
			dateFrom: params.input.dateFrom,
			dateTo: params.input.dateTo,
			failedDays: failures.length,
		})
	}

	return {
		mode: "apply",
		variantId: params.input.variantId,
		range: preview.range,
		operation: preview.operation,
		summary: {
			...preview.summary,
			successfulDays,
			failedDays: failures.length,
		},
		days: preview.days,
		failures,
	}
}

function aggregateApplyResults(results: BulkInventoryApplyResult[]) {
	const summary = {
		variantsTotal: results.length,
		variantsWithChanges: results.filter((item) => item.summary.changedDays > 0).length,
		totalDaysInRange: 0,
		targetDays: 0,
		changedDays: 0,
		resultingOpenDays: 0,
		resultingClosedDays: 0,
		totalCapacityDelta: 0,
		successfulDays: 0,
		failedDays: 0,
	}
	for (const result of results) {
		summary.totalDaysInRange += Number(result.summary.totalDaysInRange ?? 0)
		summary.targetDays += Number(result.summary.targetDays ?? 0)
		summary.changedDays += Number(result.summary.changedDays ?? 0)
		summary.resultingOpenDays += Number(result.summary.resultingOpenDays ?? 0)
		summary.resultingClosedDays += Number(result.summary.resultingClosedDays ?? 0)
		summary.totalCapacityDelta += Number(result.summary.totalCapacityDelta ?? 0)
		summary.successfulDays += Number(result.summary.successfulDays ?? 0)
		summary.failedDays += Number(result.summary.failedDays ?? 0)
	}
	const days = results.flatMap((result) =>
		result.days.map((day) => ({
			...day,
			variantId: result.variantId,
		}))
	)
	const failures = results.flatMap((result) =>
		result.failures.map((failure) => ({
			...failure,
			date: `${result.variantId}:${failure.date}`,
		}))
	)
	return { summary, days, failures }
}

export async function applyBulkInventoryOperation(params: {
	request: Request
	input: BulkInventoryInput | BulkInventoryOperationInputV2
}): Promise<BulkInventoryApplyResult> {
	const normalized = normalizeInput(params.input)
	if (normalized.context.dryRun) {
		const preview = await simulateBulkInventoryOperation({
			request: params.request,
			input: params.input,
		})
		const successfulDays = Number(preview.summary.changedDays ?? 0)
		return {
			mode: "apply",
			variantId: preview.variantId,
			range: preview.range,
			operation: preview.operation,
			summary: {
				...preview.summary,
				successfulDays,
				failedDays: 0,
			},
			days: preview.days,
			failures: [],
			summaryAggregated: preview.summaryAggregated
				? {
						...preview.summaryAggregated,
						successfulDays,
						failedDays: 0,
					}
				: null,
			units:
				preview.units?.map((unit) => ({
					variantId: unit.variantId,
					range: unit.range,
					operation: unit.operation,
					summary: {
						...unit.summary,
						successfulDays: Number(unit.summary.changedDays ?? 0),
						failedDays: 0,
					},
					days: unit.days,
					failures: [],
				})) ?? [],
			context: {
				mode: normalized.mode,
				dryRun: true,
				source: normalized.context.source,
			},
		}
	}

	const applies = await Promise.all(
		normalized.items.map((item) => applySingle({ request: params.request, input: item }))
	)
	const primary = applies[0]
	if (!primary) {
		throw new Error("bulk_inventory_empty_selection")
	}
	if (normalized.mode === "legacy") return primary

	const aggregated = aggregateApplyResults(applies)
	return {
		...primary,
		summary: {
			totalDaysInRange: aggregated.summary.totalDaysInRange,
			targetDays: aggregated.summary.targetDays,
			changedDays: aggregated.summary.changedDays,
			resultingOpenDays: aggregated.summary.resultingOpenDays,
			resultingClosedDays: aggregated.summary.resultingClosedDays,
			totalCapacityDelta: aggregated.summary.totalCapacityDelta,
			successfulDays: aggregated.summary.successfulDays,
			failedDays: aggregated.summary.failedDays,
		},
		days: aggregated.days,
		failures: aggregated.failures,
		summaryAggregated: aggregated.summary,
		units: applies.map((apply) => ({
			variantId: apply.variantId,
			range: apply.range,
			operation: apply.operation,
			summary: apply.summary,
			days: apply.days,
			failures: apply.failures,
		})),
		context: {
			mode: normalized.mode,
			dryRun: false,
			source: normalized.context.source,
		},
	}
}
