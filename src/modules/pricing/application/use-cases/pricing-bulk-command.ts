import { normalizedPricingRuleCommandFromPayload } from "@/lib/pricing/rules-v2"

import type { NormalizedPricingRuleCommand } from "./pricing-rule-command-service"

export type BulkPricingOperation = {
	type: string
	value: number
	conditions?: {
		priority?: number
		dateFrom?: string
		dateTo?: string
		dayOfWeek?: number[] | string
		contextKey?: string
		occupancyKey?: string
		currency?: string
		previewFrom?: string
		previewDays?: number
		effectiveFrom?: string
		effectiveTo?: string
		effectiveDays?: number
	}
}

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00.000Z`)
	value.setUTCDate(value.getUTCDate() + days)
	return value.toISOString().slice(0, 10)
}

/** Normalizes the commercial range once for synchronous preview and queued work. */
export function resolveBulkPricingEffectiveDateRange(operation: BulkPricingOperation) {
	const conditions = operation.conditions ?? {}
	const today = new Date().toISOString().slice(0, 10)
	const requestedDays = Number(conditions.effectiveDays)
	const hasRequestedDuration = Number.isInteger(requestedDays) && requestedDays > 0
	const dateFrom =
		conditions.effectiveFrom ?? conditions.dateFrom ?? (hasRequestedDuration ? today : undefined)
	const rangeStart = dateFrom ?? today
	const dateTo =
		conditions.effectiveTo ??
		conditions.dateTo ??
		(hasRequestedDuration ? addDays(rangeStart, requestedDays - 1) : undefined)
	return { dateFrom, dateTo }
}

export function pricingRulePayloadFromBulkOperation(operation: BulkPricingOperation) {
	const conditions = operation.conditions ?? {}
	const effectiveRange = resolveBulkPricingEffectiveDateRange(operation)
	return {
		type: operation.type,
		value: operation.value,
		priority: conditions.priority ?? 10,
		dateFrom: effectiveRange.dateFrom,
		dateTo: effectiveRange.dateTo,
		dayOfWeek: Array.isArray(conditions.dayOfWeek)
			? conditions.dayOfWeek.join(",")
			: conditions.dayOfWeek,
		contextKey: conditions.contextKey,
		occupancyKey: conditions.occupancyKey,
		currency: conditions.currency,
		previewFrom: conditions.previewFrom,
		previewDays: conditions.previewDays,
	}
}

export function normalizedPricingRuleCommandFromBulkOperation(
	operation: BulkPricingOperation
): NormalizedPricingRuleCommand {
	return normalizedPricingRuleCommandFromPayload(pricingRulePayloadFromBulkOperation(operation))
}
