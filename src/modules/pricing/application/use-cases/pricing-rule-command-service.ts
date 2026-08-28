import { evaluatePricingRuleEligibility } from "../../domain/pricing-rule-eligibility"
import { evaluatePricingRules } from "../../domain/evaluatePricingRules"
import type { PricingRuleEligibility } from "../../domain/pricing-rule-eligibility"

type StoredPricingRule = {
	id: string
	type: string
	value: number
	priority: number
	dateFrom: string | null
	dateTo: string | null
	dayOfWeek: number[]
	occupancyKey: string | null
	eligibility: PricingRuleEligibility | null
	contextKey: string | null
	createdAt: Date
}

export type PricingRuleContext = {
	providerId: string
	productId: string
	variantId: string
	ratePlanId: string
}

export type NormalizedPricingRuleCommand = {
	type: string
	value: number
	priority: number
	dateFrom?: string
	dateTo?: string
	dayOfWeek?: number[]
	contextKey?: string
	occupancyKey?: string
	currency?: string
	previewFrom?: string
	previewDays?: number
	requestDate?: string
	checkIn?: string
	checkOut?: string
	nights?: number
	eligibility?: {
		minLeadDays?: number | null
		maxLeadDays?: number | null
		minNights?: number | null
	} | null
}

export class PricingRuleCommandError extends Error {
	constructor(
		public readonly code: string,
		public readonly status = 400
	) {
		super(code)
		this.name = "PricingRuleCommandError"
	}
}

type PricingRuleCommandDependencies = {
	getPricingSummary(ratePlanId: string): Promise<{ basePrice: number; currency: string } | null>
	getFallbackCurrency(ratePlanId: string): Promise<string>
	listRules(ratePlanId: string): Promise<StoredPricingRule[]>
	createRule(input: {
		providerId: string
		ratePlanId: string
		name: string | null
		type: string
		value: number
		priority: number
		dateRangeJson: Record<string, unknown> | null
		dayOfWeekJson: number[] | null
		occupancyKey: string | null
	}): Promise<{ ruleId: string }>
	rematerialize(input: {
		variantId: string
		ratePlanId: string
		from: string
		to: string
		occupancy: { adults: number; children: number; infants: number }
		fallbackCurrency?: string
	}): Promise<{ missingDatesCount: number; generatedDatesCount: number }>
	invalidatePricing(input: { ratePlanId: string; variantId: string }): Promise<void>
	enqueueAri(input: {
		variantId: string
		ratePlanId: string
		from: string
		toExclusive: string
	}): Promise<unknown>
}

function dateOnly(value: string | undefined, code: string) {
	if (!value) return undefined
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
		throw new PricingRuleCommandError(code)
	}
	return value
}

function dateRange(command: NormalizedPricingRuleCommand) {
	const from = dateOnly(command.dateFrom, "invalid_date_from")
	const to = dateOnly(command.dateTo, "invalid_date_to")
	if (from && to && to < from) throw new PricingRuleCommandError("invalid_date_range")
	const eligibility = command.eligibility ?? null
	return from || to || eligibility
		? { from: from ?? null, to: to ?? null, ...(eligibility ? { eligibility } : {}) }
		: null
}

function occupancyFromKey(value?: string) {
	const match = /^a(\d+)_c(\d+)_i(\d+)$/.exec(String(value ?? ""))
	return match
		? { adults: Number(match[1]), children: Number(match[2]), infants: Number(match[3]) }
		: { adults: 2, children: 0, infants: 0 }
}

function addDays(value: string, days: number) {
	const date = new Date(`${value}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

export class PricingRuleCommandService {
	constructor(private readonly deps: PricingRuleCommandDependencies) {}

	async previewCandidate(context: PricingRuleContext, command: NormalizedPricingRuleCommand) {
		if (!Number.isFinite(command.value)) throw new PricingRuleCommandError("invalid_value")
		const range = dateRange(command)
		const fallbackCurrency = String(command.currency ?? "USD").toUpperCase()
		const storedSummary = await this.deps.getPricingSummary(context.ratePlanId)
		const pricingSummary =
			storedSummary ??
			(command.type === "fixed_override"
				? {
						basePrice: 0,
						currency: fallbackCurrency || (await this.deps.getFallbackCurrency(context.ratePlanId)),
					}
				: null)
		if (!pricingSummary) throw new PricingRuleCommandError("pricing_missing")

		const previewFrom = command.previewFrom ?? new Date().toISOString().slice(0, 10)
		dateOnly(previewFrom, "invalid_preview_from")
		const previewDays = Math.min(Math.max(Math.trunc(command.previewDays ?? 30), 1), 120)
		const requestDate = command.requestDate ?? new Date().toISOString().slice(0, 10)
		const checkIn = command.checkIn ?? previewFrom
		const requestedNights = Number(command.nights)
		const nights = Number.isFinite(requestedNights) ? requestedNights : Number.NaN
		const checkOut =
			command.checkOut ?? addDays(checkIn, Math.max(1, Number.isFinite(nights) ? nights : 1))
		const stayContext = { requestDate, checkIn, checkOut, nights }
		const storedRules = await this.deps.listRules(context.ratePlanId)
		const rules = storedRules.map((rule) => ({
			id: String(rule.id),
			type: String(rule.type),
			value: Number(rule.value),
			priority: Number(rule.priority),
			dateRange:
				rule.dateFrom || rule.dateTo
					? { from: rule.dateFrom ?? undefined, to: rule.dateTo ?? undefined }
					: null,
			dayOfWeek: rule.dayOfWeek,
			occupancyKey: rule.occupancyKey,
			eligibility: rule.eligibility,
			contextKey: rule.contextKey,
			createdAt: new Date(rule.createdAt),
			isActive: true,
		}))
		const candidate = {
			id: "__candidate__",
			type: command.type,
			value: command.value,
			priority: command.priority,
			dateRange: range,
			dayOfWeek: command.dayOfWeek ?? null,
			occupancyKey: command.occupancyKey ?? null,
			eligibility: command.eligibility ?? null,
			contextKey: command.contextKey,
			createdAt: new Date(),
			isActive: true,
		}
		const candidateEligibility = evaluatePricingRuleEligibility({
			eligibility: command.eligibility ?? null,
			stayContext,
			ruleLabel: command.contextKey ?? command.type,
		})
		const days = []
		for (let offset = 0; offset < previewDays; offset += 1) {
			const date = addDays(previewFrom, offset)
			const before = evaluatePricingRules({
				basePrice: Number(pricingSummary.basePrice),
				date,
				occupancyKey: command.occupancyKey ?? null,
				ratePlanId: context.ratePlanId,
				rules,
				stayContext,
				includeEligibilityTrace: true,
			})
			const after = evaluatePricingRules({
				basePrice: Number(pricingSummary.basePrice),
				date,
				occupancyKey: command.occupancyKey ?? null,
				ratePlanId: context.ratePlanId,
				rules: [...rules, candidate],
				stayContext,
				includeEligibilityTrace: true,
			})
			days.push({
				date,
				before: Number(before.price),
				after: Number(after.price),
				delta: Number((after.price - before.price).toFixed(2)),
				appliedRuleIds: after.appliedRuleIds,
				eligibilityTrace: after.eligibilityTrace,
			})
		}
		return {
			basePrice: Number(pricingSummary.basePrice),
			currency: String(pricingSummary.currency),
			ratePlanId: context.ratePlanId,
			occupancyKey: command.occupancyKey ?? null,
			stayContext,
			candidateEligibility,
			currentRuleCount: storedRules.length,
			days,
		}
	}

	async createRule(context: PricingRuleContext, command: NormalizedPricingRuleCommand) {
		if (!Number.isFinite(command.value)) throw new PricingRuleCommandError("invalid_value")
		const range = dateRange(command)
		const created = await this.deps.createRule({
			providerId: context.providerId,
			ratePlanId: context.ratePlanId,
			name: command.contextKey ? `ctx:${command.contextKey}` : null,
			type: command.type,
			value: command.value,
			priority: command.priority,
			dateRangeJson: range,
			dayOfWeekJson: command.dayOfWeek ?? null,
			occupancyKey: command.occupancyKey ?? null,
		})
		const from = command.dateFrom ?? new Date().toISOString().slice(0, 10)
		const to = command.dateTo ? addDays(command.dateTo, 1) : addDays(from, 60)
		const rematerialization = await this.deps.rematerialize({
			variantId: context.variantId,
			ratePlanId: context.ratePlanId,
			from,
			to,
			occupancy: occupancyFromKey(command.occupancyKey),
			fallbackCurrency: command.currency,
		})
		if (rematerialization.generatedDatesCount > 0) {
			await this.deps.invalidatePricing({
				ratePlanId: context.ratePlanId,
				variantId: context.variantId,
			})
			await this.deps.enqueueAri({
				variantId: context.variantId,
				ratePlanId: context.ratePlanId,
				from,
				toExclusive: to,
			})
		}
		const rules = await this.deps.listRules(context.ratePlanId)
		return {
			ruleId: created.ruleId,
			ratePlanId: context.ratePlanId,
			rematerialization,
			rules,
		}
	}
}
