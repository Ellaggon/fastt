import type { APIRoute } from "astro"
import { and, db, eq, RatePlan, TourSlotProfile, Variant } from "@/shared/infrastructure/db/compat"
import {
	buildPolicySnapshot,
	derivePolicySummaryFromResolvedPolicies,
	resolveEffectivePolicies,
} from "@/modules/policies/public"

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	})
}

export const GET: APIRoute = async ({ url }) => {
	const productId = String(url.searchParams.get("productId") ?? "").trim()
	const variantId = String(url.searchParams.get("variantId") ?? "").trim()
	const ratePlanId = String(url.searchParams.get("ratePlanId") ?? "").trim()
	const departure = String(url.searchParams.get("departure") ?? "").trim()
	if (!productId || !variantId || !ratePlanId || !/^\d{4}-\d{2}-\d{2}$/.test(departure)) {
		return json({ error: "invalid_selection" }, 400)
	}

	const selected = await db
		.select({
			confirmationType: Variant.confirmationType,
			bookingMode: TourSlotProfile.bookingMode,
			departureTime: TourSlotProfile.departureTime,
		})
		.from(Variant)
		.innerJoin(RatePlan, eq(RatePlan.variantId, Variant.id))
		.leftJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
		.where(
			and(
				eq(Variant.id, variantId),
				eq(Variant.productId, productId),
				eq(RatePlan.id, ratePlanId),
				eq(RatePlan.isActive, true)
			)
		)
		.limit(1)
		.then((rows) => rows[0] ?? null)
	if (!selected) return json({ error: "selection_not_found" }, 404)

	try {
		const checkIn = new Date(`${departure}T00:00:00.000Z`)
		const checkOut = new Date(checkIn)
		checkOut.setUTCDate(checkOut.getUTCDate() + 1)
		const resolved = await resolveEffectivePolicies({
			productId,
			variantId,
			ratePlanId,
			checkIn: departure,
			checkOut: checkOut.toISOString().slice(0, 10),
			channel: "web",
		})
		const snapshot = buildPolicySnapshot({
			resolvedPolicies: resolved,
			checkIn: departure,
			checkOut: checkOut.toISOString().slice(0, 10),
			channel: "web",
			departureTime: selected.departureTime ?? undefined,
		})
		const mode = String(selected.bookingMode ?? "shared").toLowerCase()
		const immediate = mode === "shared" && String(selected.confirmationType) === "instant"
		return json({
			policySummary:
				derivePolicySummaryFromResolvedPolicies(resolved) || "Condiciones según la opción elegida.",
			freeCancellationDeadline:
				snapshot.cancellation?.calculation?.cancellation?.freeCancellationDeadlineLocal ?? null,
			bookingStatus: mode === "private" ? "request" : immediate ? "instant" : "review",
		})
	} catch {
		return json({ error: "selection_summary_unavailable" }, 503)
	}
}
