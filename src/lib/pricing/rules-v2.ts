import { and, db, eq, PriceRule } from "astro:db"

import { productRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	formatPricingRuleEligibilityLabel,
	type PricingRuleEligibility,
	resolveRatePlanOwnerContext,
} from "@/modules/pricing/public"

export async function readRequestPayload(request: Request): Promise<Record<string, unknown>> {
	const contentType = String(request.headers.get("content-type") ?? "")
	if (contentType.includes("application/json")) {
		return ((await request.json().catch(() => ({}))) as Record<string, unknown>) ?? {}
	}
	const form = await request.formData()
	const out: Record<string, unknown> = {}
	for (const [key, value] of form.entries()) out[key] = String(value)
	return out
}

export function requireText(payload: Record<string, unknown>, key: string): string {
	return String(payload[key] ?? "").trim()
}

export function optionalText(payload: Record<string, unknown>, key: string): string | undefined {
	const value = String(payload[key] ?? "").trim()
	return value.length > 0 ? value : undefined
}

export function normalizeOccupancyKey(raw?: string): string | undefined {
	const value = String(raw ?? "").trim()
	if (!value) return undefined
	return /^a\d+_c\d+_i\d+$/.test(value) ? value : undefined
}

export type PricingCoverageOccupancy = {
	adults: number
	children: number
	infants: number
}

export const DEFAULT_PRICING_COVERAGE_OCCUPANCY: PricingCoverageOccupancy = {
	adults: 2,
	children: 0,
	infants: 0,
}

export function resolveCoverageOccupancy(raw?: string | null): PricingCoverageOccupancy {
	const occupancyKey = normalizeOccupancyKey(raw ?? undefined)
	if (!occupancyKey) return DEFAULT_PRICING_COVERAGE_OCCUPANCY
	const match = /^a(\d+)_c(\d+)_i(\d+)$/.exec(occupancyKey)
	if (!match) return DEFAULT_PRICING_COVERAGE_OCCUPANCY
	return {
		adults: Number(match[1]),
		children: Number(match[2]),
		infants: Number(match[3]),
	}
}

export function parseNumber(
	payload: Record<string, unknown>,
	key: string,
	fallback: number
): number {
	const raw = String(payload[key] ?? "").trim()
	if (!raw) return fallback
	const parsed = Number(raw)
	return Number.isFinite(parsed) ? parsed : fallback
}

function parsePositiveInteger(payload: Record<string, unknown>, key: string): number | undefined {
	const raw = String(payload[key] ?? "").trim()
	if (!raw) return undefined
	const parsed = Number(raw)
	if (!Number.isFinite(parsed)) return undefined
	const value = Math.trunc(parsed)
	return value > 0 ? value : undefined
}

export function parsePricingRuleEligibility(
	payload: Record<string, unknown>
): PricingRuleEligibility | null {
	const eligibility: PricingRuleEligibility = {
		minLeadDays: parsePositiveInteger(payload, "minLeadDays"),
		maxLeadDays: parsePositiveInteger(payload, "maxLeadDays"),
		minNights: parsePositiveInteger(payload, "minNights"),
	}
	return eligibility.minLeadDays || eligibility.maxLeadDays || eligibility.minNights
		? eligibility
		: null
}

export function readPricingRuleEligibility(value: unknown): PricingRuleEligibility | null {
	if (!value || typeof value !== "object") return null
	const raw = (value as { eligibility?: unknown }).eligibility
	if (!raw || typeof raw !== "object") return null
	const eligibility = raw as Record<string, unknown>
	const normalized: PricingRuleEligibility = {
		minLeadDays: Number.isFinite(Number(eligibility.minLeadDays))
			? Math.trunc(Number(eligibility.minLeadDays))
			: undefined,
		maxLeadDays: Number.isFinite(Number(eligibility.maxLeadDays))
			? Math.trunc(Number(eligibility.maxLeadDays))
			: undefined,
		minNights: Number.isFinite(Number(eligibility.minNights))
			? Math.trunc(Number(eligibility.minNights))
			: undefined,
	}
	return normalized.minLeadDays || normalized.maxLeadDays || normalized.minNights
		? normalized
		: null
}

export function buildDateRangeJson(params: {
	dateFrom?: string | null
	dateTo?: string | null
	eligibility?: PricingRuleEligibility | null
}): Record<string, unknown> | null {
	const hasRange = Boolean(params.dateFrom || params.dateTo)
	const hasEligibility = Boolean(
		params.eligibility?.minLeadDays ||
		params.eligibility?.maxLeadDays ||
		params.eligibility?.minNights
	)
	if (!hasRange && !hasEligibility) return null
	return {
		from: params.dateFrom ?? null,
		to: params.dateTo ?? null,
		...(hasEligibility ? { eligibility: params.eligibility } : {}),
	}
}

export function validatePricingRuleEligibility(params: {
	contextKey?: string | null
	eligibility?: PricingRuleEligibility | null
}): string | null {
	const contextKey = String(params.contextKey ?? "").trim()
	const eligibility = params.eligibility ?? null
	if (contextKey === "early_bird" && !eligibility?.minLeadDays) return "min_lead_days_required"
	if (contextKey === "last_minute" && !eligibility?.maxLeadDays) return "max_lead_days_required"
	if (contextKey === "los_discount" && !eligibility?.minNights) return "min_nights_required"
	return null
}

export { formatPricingRuleEligibilityLabel }

export function normalizeRuleType(value: string): string {
	if (value === "percentage") return "percentage_markup"
	if (value === "fixed" || value === "override") return "fixed_override"
	if (value === "modifier") return "fixed_adjustment"
	return value
}

export function parseDayOfWeek(value?: string): number[] | undefined {
	if (!value) return undefined
	const parsed = value
		.split(",")
		.map((item) => Number(item.trim()))
		.filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
	return parsed.length ? parsed : undefined
}

export function isValidDateOnly(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
	)
}

export async function resolveOwnedRatePlanContext(
	request: Request,
	ratePlanId: string
): Promise<
	| {
			ok: true
			ownerContext: {
				ratePlanId: string
				variantId: string
				productId: string
				providerId: string | null
			}
	  }
	| { ok: false; response: Response }
> {
	const user = await getUserFromRequest(request)
	if (!user?.email) {
		return {
			ok: false,
			response: new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
		}
	}
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) {
		return {
			ok: false,
			response: new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
		}
	}
	const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
	if (!ownerContext) {
		return {
			ok: false,
			response: new Response(JSON.stringify({ error: "ratePlan_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			}),
		}
	}
	const owned = await productRepository.ensureProductOwnedByProvider(
		ownerContext.productId,
		providerId
	)
	if (!owned) {
		return {
			ok: false,
			response: new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			}),
		}
	}
	return { ok: true, ownerContext }
}

export async function ensureRuleBelongsToRatePlan(
	ruleId: string,
	ratePlanId: string
): Promise<boolean> {
	const row = await db
		.select({ id: PriceRule.id })
		.from(PriceRule)
		.where(and(eq(PriceRule.id, ruleId), eq(PriceRule.ratePlanId, ratePlanId)))
		.get()
	return Boolean(row?.id)
}

export function buildProxyHeadersFromRequest(request: Request): Headers {
	const headers = new Headers()
	const cookie = request.headers.get("cookie")
	if (cookie) headers.set("cookie", cookie)
	return headers
}

export function toDateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

export function addDays(value: Date, days: number): Date {
	const next = new Date(value)
	next.setUTCDate(next.getUTCDate() + days)
	return next
}

export async function listRulesByRatePlan(ratePlanId: string) {
	const rows = await db.select().from(PriceRule).where(eq(PriceRule.ratePlanId, ratePlanId)).all()
	return rows
		.map((row) => ({
			id: String(row.id),
			ratePlanId: String(row.ratePlanId),
			name: row.name ?? null,
			type: String(row.type),
			value: Number(row.value),
			priority: Number(row.priority ?? 10),
			dateFrom:
				row.dateRangeJson && typeof row.dateRangeJson === "object"
					? String((row.dateRangeJson as any).from ?? "").trim() || null
					: null,
			dateTo:
				row.dateRangeJson && typeof row.dateRangeJson === "object"
					? String((row.dateRangeJson as any).to ?? "").trim() || null
					: null,
			eligibility: readPricingRuleEligibility(row.dateRangeJson),
			eligibilityLabel: formatPricingRuleEligibilityLabel(
				readPricingRuleEligibility(row.dateRangeJson)
			),
			dayOfWeek: Array.isArray(row.dayOfWeekJson)
				? (row.dayOfWeekJson as unknown[])
						.map((item) => Number(item))
						.filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
				: [],
			contextKey:
				typeof row.name === "string" && row.name.startsWith("ctx:") ? row.name.slice(4) : null,
			occupancyKey:
				typeof (row as any).occupancyKey === "string" && String((row as any).occupancyKey).trim()
					? String((row as any).occupancyKey).trim()
					: null,
			isActive: Boolean(row.isActive),
			createdAt: row.createdAt,
		}))
		.sort((a, b) => {
			const byPriority = a.priority - b.priority
			if (byPriority !== 0) return byPriority
			const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime()
			if (byCreatedAt !== 0) return byCreatedAt
			return a.id.localeCompare(b.id)
		})
}
