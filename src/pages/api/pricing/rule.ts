import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { createDefaultPriceRule, ensurePricingCoverageRuntime } from "@/modules/pricing/public"
import {
	baseRateRepository,
	ratePlanRepository,
	ratePlanCommandRepository,
	priceRuleCommandRepository,
	variantManagementRepository,
	productRepository,
} from "@/container"

const REMATERIALIZE_HORIZON_DAYS = 60

function parseDateOnly(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
	const parsed = new Date(`${value}T00:00:00.000Z`)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toDateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
	const next = new Date(value)
	next.setUTCDate(next.getUTCDate() + days)
	return next
}

function resolveRematerializationRange(
	dateFromRaw: string,
	dateToRaw: string
): { from: string; to: string } {
	const today = new Date()
	today.setUTCHours(0, 0, 0, 0)
	const dateFrom = dateFromRaw ? parseDateOnly(dateFromRaw) : null
	const dateTo = dateToRaw ? parseDateOnly(dateToRaw) : null

	if (dateFrom && dateTo) {
		const toExclusive = addDays(dateTo, 1)
		return {
			from: toDateOnly(dateFrom),
			to: toDateOnly(toExclusive),
		}
	}

	if (dateFrom) {
		return {
			from: toDateOnly(dateFrom),
			to: toDateOnly(addDays(dateFrom, REMATERIALIZE_HORIZON_DAYS)),
		}
	}

	if (dateTo) {
		return {
			from: toDateOnly(today),
			to: toDateOnly(addDays(dateTo, 1)),
		}
	}

	return {
		from: toDateOnly(today),
		to: toDateOnly(addDays(today, REMATERIALIZE_HORIZON_DAYS)),
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const variantId = String(form.get("variantId") ?? "").trim()
		const type = String(form.get("type") ?? "").trim()
		const value = Number(form.get("value"))
		const priorityRaw = form.get("priority")
		const priority =
			priorityRaw === null || String(priorityRaw).trim() === "" ? undefined : Number(priorityRaw)
		const dateFrom = String(form.get("dateFrom") ?? "").trim()
		const dateTo = String(form.get("dateTo") ?? "").trim()
		const dayOfWeekRaw = String(form.get("dayOfWeek") ?? "").trim()
		const dayOfWeek = dayOfWeekRaw
			? dayOfWeekRaw
					.split(",")
					.map((value) => Number(value.trim()))
					.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
			: undefined
		const contextKeyRaw = String(form.get("contextKey") ?? "").trim()
		const contextKey =
			contextKeyRaw === "season" ||
			contextKeyRaw === "promotion" ||
			contextKeyRaw === "day" ||
			contextKeyRaw === "manual"
				? contextKeyRaw
				: undefined

		const v = await variantManagementRepository.getVariantById(variantId)
		if (!v) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const owned = await productRepository.ensureProductOwnedByProvider(v.productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await createDefaultPriceRule(
			{
				baseRateRepo: baseRateRepository,
				ratePlanRepo: ratePlanRepository,
				ratePlanCmdRepo: ratePlanCommandRepository,
				priceRuleCmdRepo: priceRuleCommandRepository,
			},
			{
				variantId,
				type: type as any,
				value,
				priority,
				dateRange:
					dateFrom || dateTo ? { from: dateFrom || undefined, to: dateTo || undefined } : undefined,
				dayOfWeek,
				contextKey,
			}
		)

		const rematerializationRange = resolveRematerializationRange(dateFrom, dateTo)
		const rematerializeResult = await ensurePricingCoverageRuntime({
			variantId,
			ratePlanId: result.ratePlanId,
			from: rematerializationRange.from,
			to: rematerializationRange.to,
			recomputeExisting: true,
		})
		console.debug("pricing_rule_materialized", {
			variantId,
			ruleId: result.ruleId,
			ratePlanId: result.ratePlanId,
			from: rematerializationRange.from,
			to: rematerializationRange.to,
			generatedDatesCount: rematerializeResult.generatedDatesCount,
		})

		await invalidateVariant(variantId, v.productId)

		return new Response(JSON.stringify({ ...result, rematerialization: rematerializeResult }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
