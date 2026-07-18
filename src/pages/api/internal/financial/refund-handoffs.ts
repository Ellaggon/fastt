import type { APIRoute } from "astro"

import { refundHandoffRepository } from "@/container/financial.container"
import type { RefundHandoffStatus } from "@/modules/financial/public"

import { json, requireFinancialProvider } from "./_stage2"

const allowedStatuses = new Set([
	"required",
	"acknowledged",
	"waiting_external",
	"evidence_recorded",
	"closed",
	"dismissed",
	"all",
])

function parseRefundCursor(value: string | null): { openedAt: Date; id: string } | null {
	if (!value) return null
	const [time, id] = value.split("|")
	const openedAt = new Date(Number(time))
	if (!id || Number.isNaN(openedAt.getTime())) return null
	return { openedAt, id }
}

function refundCursorFromItem(item: { openedAt?: unknown; id?: unknown }): string | null {
	const date = item.openedAt ? new Date(String(item.openedAt)) : null
	if (!date || Number.isNaN(date.getTime()) || !item.id) return null
	return `${date.getTime()}|${String(item.id)}`
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const url = new URL(request.url)
	const bookingIds = [
		...String(url.searchParams.get("bookingIds") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		...String(url.searchParams.get("bookingId") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	]
	const status = String(url.searchParams.get("status") ?? "all").trim()
	if (!allowedStatuses.has(status)) return json({ error: "validation_error" }, 400)
	const rawLimit = Number(url.searchParams.get("limit") ?? 100)
	const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 100, 250))
	const cursor = parseRefundCursor(url.searchParams.get("cursor"))
	try {
		const items = await refundHandoffRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			status: status as RefundHandoffStatus | "all",
			limit: limit + 1,
			cursor,
		})
		const visibleItems = items.slice(0, limit)
		return json({
			items: visibleItems,
			pagination: {
				limit,
				returned: visibleItems.length,
				hasMore: items.length > limit,
				nextCursor: items.length > limit ? refundCursorFromItem(visibleItems[limit - 1]) : null,
			},
		})
	} catch (error) {
		console.warn("refund_handoff_lookup_degraded", {
			providerId: auth.providerId,
			error: error instanceof Error ? error.message : "unknown",
		})
		return json({
			items: [],
			degraded: true,
			pagination: { limit, returned: 0, hasMore: false, nextCursor: null },
		})
	}
}
