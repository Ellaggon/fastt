import { buildTourPlaybookHref } from "./launch-tour"
import { buildCompleteToPublishHref } from "./complete-to-publish"

type Context = {
	productId: string
	variantId: string
	ratePlanId: string
	playbook: "launch-tour" | "complete-to-publish"
}
export type CommercialBlocker = { id: string; label: string }

/** Correction targets come from diagnostic IDs, never from translated messages. */
export function tourActivationBlockers(blockers: CommercialBlocker[], context: Context) {
	return blockers.map((blocker) => {
		const query = new URLSearchParams({
			productId: context.productId,
			variantId: context.variantId,
			ratePlanId: context.ratePlanId,
		})
		let path: string
		let step: "rate" | "bookingPolicies" | "calendar" | "departure"
		if (["price", "pricing_missing"].includes(blocker.id)) {
			query.set("vista", "price")
			path = `/rates/plans/${encodeURIComponent(context.ratePlanId)}`
			step = "rate"
		} else if (blocker.id === "conditions") {
			query.set("vista", "conditions")
			path = `/rates/plans/${encodeURIComponent(context.ratePlanId)}`
			step = "bookingPolicies"
		} else if (blocker.id === "availability") {
			query.set("focus", "availability")
			path = "/rates/calendar"
			step = "calendar"
		} else {
			path = `/product/${encodeURIComponent(context.productId)}/departures/${encodeURIComponent(context.variantId)}`
			step = "departure"
		}
		const target = `${path}?${query}`
		const labels: Record<string, string> = {
			missing_tour_slot_profile: "Completa el horario, idioma y grupo de esta opción.",
			missing_capacity: "Define la capacidad de esta opción.",
			pricing_missing: "Completa el precio de esta tarifa.",
		}
		return {
			...blocker,
			label: labels[blocker.id] ?? blocker.label,
			href:
				context.playbook === "complete-to-publish"
					? buildCompleteToPublishHref(target, step)
					: buildTourPlaybookHref(target, step === "bookingPolicies" ? "conditions" : step),
		}
	})
}
