import type { APIRoute } from "astro"
import { variantManagementRepository } from "@/container"
import { ensurePricingCoverageRuntime } from "@/modules/pricing/public"

import {
	optionalText,
	parseNumber,
	readRequestPayload,
	requireText,
	resolveOwnedRatePlanContext,
} from "@/lib/pricing/rules-v2"

export const POST: APIRoute = async ({ request }) => {
	const payload = await readRequestPayload(request)
	const ratePlanId = requireText(payload, "ratePlanId")
	if (!ratePlanId) {
		return new Response(JSON.stringify({ error: "ratePlanId_required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	const context = await resolveOwnedRatePlanContext(request, ratePlanId)
	if (!context.ok) return context.response

	const baseRate = await variantManagementRepository.getBaseRate(context.ownerContext.variantId)
	if (!baseRate) {
		return new Response(JSON.stringify({ error: "pricing_missing" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
	const from = optionalText(payload, "from")
	const to = optionalText(payload, "to")
	const days = Math.max(Math.trunc(parseNumber(payload, "days", 60)), 1)

	const dates =
		from && to
			? (() => {
					const start = new Date(`${from}T00:00:00.000Z`)
					const end = new Date(`${to}T00:00:00.000Z`)
					if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
						return [] as string[]
					const out: string[] = []
					const cursor = new Date(start)
					while (cursor < end) {
						out.push(cursor.toISOString().slice(0, 10))
						cursor.setUTCDate(cursor.getUTCDate() + 1)
					}
					return out
				})()
			: (() => {
					const start = new Date()
					start.setUTCHours(0, 0, 0, 0)
					return Array.from({ length: days }).map((_, offset) => {
						const date = new Date(start)
						date.setUTCDate(start.getUTCDate() + offset)
						return date.toISOString().slice(0, 10)
					})
				})()
	if (!dates.length) {
		return new Response(JSON.stringify({ error: "invalid_date_range" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const fromDate = dates[0]
	const lastDate = dates[dates.length - 1]
	const toDateExclusive = (() => {
		const next = new Date(`${lastDate}T00:00:00.000Z`)
		next.setUTCDate(next.getUTCDate() + 1)
		return next.toISOString().slice(0, 10)
	})()
	const v2Rematerialization = await ensurePricingCoverageRuntime({
		variantId: context.ownerContext.variantId,
		ratePlanId,
		from: fromDate,
		to: toDateExclusive,
		recomputeExisting: true,
	})
	const writes = v2Rematerialization.generatedDatesCount

	return new Response(
		JSON.stringify({
			ok: true,
			daysGenerated: writes,
			v2Rematerialization,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
