import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { evaluatePricingRules } from "@/modules/pricing/public"
import { pricingRepository, productRepository, variantManagementRepository } from "@/container"

const schema = z.object({
	variantId: z.string().min(1),
	days: z.number().int().min(1).max(365).default(60),
	from: z.string().trim().optional(),
	to: z.string().trim().optional(),
})

function toDateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function buildDateRange(from: string, to: string): string[] {
	const start = parseDateOnly(from)
	const end = parseDateOnly(to)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []
	const dates: string[] = []
	const cursor = new Date(start)
	while (cursor < end) {
		dates.push(toDateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return dates
}

export const POST: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
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

		const contentType = request.headers.get("content-type") ?? ""
		let payload: unknown
		if (contentType.includes("application/json")) {
			payload = await request.json().catch(() => ({}))
		} else {
			const form = await request.formData()
			payload = {
				variantId: String(form.get("variantId") ?? "").trim(),
				days: Number(form.get("days") ?? 60),
				from: String(form.get("from") ?? "").trim() || undefined,
				to: String(form.get("to") ?? "").trim() || undefined,
			}
		}
		const parsed = schema.parse(payload)

		const variant = await variantManagementRepository.getVariantById(parsed.variantId)
		if (!variant) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const owned = await productRepository.ensureProductOwnedByProvider(
			variant.productId,
			providerId
		)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const baseRate = await variantManagementRepository.getBaseRate(parsed.variantId)
		if (!baseRate) {
			return new Response(JSON.stringify({ error: "pricing_missing" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const defaultPlan = await variantManagementRepository.getDefaultRatePlanWithRules(
			parsed.variantId
		)
		if (!defaultPlan) {
			return new Response(JSON.stringify({ error: "no_default_rate_plan" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const dates =
			parsed.from && parsed.to
				? buildDateRange(parsed.from, parsed.to)
				: (() => {
						const start = new Date()
						start.setUTCHours(0, 0, 0, 0)
						return Array.from({ length: parsed.days }).map((_, offset) => {
							const date = new Date(start)
							date.setUTCDate(start.getUTCDate() + offset)
							return toDateOnly(date)
						})
					})()
		if (!dates.length) {
			return new Response(JSON.stringify({ error: "invalid_date_range" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		let writes = 0
		for (const date of dates) {
			const { price } = evaluatePricingRules({
				basePrice: Number(baseRate.basePrice),
				date,
				ratePlanId: defaultPlan.ratePlanId,
				rules: defaultPlan.rules.map((rule) => ({
					id: String(rule.id),
					type: String(rule.type),
					value: Number(rule.value),
					priority: Number((rule as any).priority ?? 10),
					dateRange: (rule as any).dateRange ?? null,
					dayOfWeek: (rule as any).dayOfWeek ?? null,
					createdAt: rule.createdAt,
					isActive: true,
				})),
			})
			await pricingRepository.saveEffectivePrice({
				variantId: parsed.variantId,
				ratePlanId: defaultPlan.ratePlanId,
				date,
				basePrice: Number(baseRate.basePrice),
				finalBasePrice: Number(price),
			})
			writes += 1
		}

		await invalidateVariant(parsed.variantId, variant.productId)
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("generate_effective_pricing", {
			variantId: parsed.variantId,
			daysRequested: parsed.days,
			from: parsed.from ?? null,
			to: parsed.to ?? null,
			dbWrites: writes,
			durationMs,
		})
		if (durationMs > 1000) {
			console.warn("slow_generate_effective_pricing", {
				variantId: parsed.variantId,
				daysRequested: parsed.days,
				from: parsed.from ?? null,
				to: parsed.to ?? null,
				dbWrites: writes,
				durationMs,
			})
		}

		return new Response(
			JSON.stringify({
				ok: true,
				daysGenerated: writes,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		if (error instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const message = error instanceof Error ? error.message : "internal_error"
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
