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
	const limit = Number(url.searchParams.get("limit") ?? 500)
	const items = await refundHandoffRepository.findByProvider({
		providerId: auth.providerId,
		bookingIds,
		status: status as RefundHandoffStatus | "all",
		limit: Number.isFinite(limit) ? limit : 500,
	})
	return json({ items })
}
