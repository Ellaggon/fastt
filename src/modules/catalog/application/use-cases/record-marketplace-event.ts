import { randomUUID } from "node:crypto"
import type { TourTrustRepositoryPort } from "../ports/TourTrustRepositoryPort"

export type MarketplaceEventType = "impression" | "click" | "booking_attributed"

export type RecordMarketplaceEventInput = {
	eventType: MarketplaceEventType
	surface: string
	sourceProductId?: string | null
	targetProductId?: string | null
	geoPlaceId?: string | null
	bookingId?: string | null
	sessionId?: string | null
	meta?: Record<string, unknown> | null
	/** Required for booking_attributed — must own the booking. */
	userId?: string | null
}

export type RecordMarketplaceEventResult =
	| { ok: true; eventId: string; idempotent: boolean }
	| {
			ok: false
			error: "validation_error" | "unauthorized" | "booking_not_found" | "not_eligible"
	  }

/**
 * Cross-sell telemetry. Impression/click are open; booking_attributed closes the funnel
 * and requires the authenticated booking owner. Attribution is idempotent per booking+target.
 */
export async function recordMarketplaceEvent(
	deps: { repo: TourTrustRepositoryPort },
	input: RecordMarketplaceEventInput
): Promise<RecordMarketplaceEventResult> {
	const eventType = input.eventType
	const surface = String(input.surface ?? "").trim()
	if (!surface || !["impression", "click", "booking_attributed"].includes(eventType)) {
		return { ok: false, error: "validation_error" }
	}

	const sourceProductId = String(input.sourceProductId ?? "").trim() || null
	const targetProductId = String(input.targetProductId ?? "").trim() || null
	const geoPlaceId = String(input.geoPlaceId ?? "").trim() || null
	const bookingId = String(input.bookingId ?? "").trim() || null
	const sessionId = String(input.sessionId ?? "").trim() || null
	const userId = String(input.userId ?? "").trim() || null

	if (eventType === "booking_attributed") {
		if (!userId) return { ok: false, error: "unauthorized" }
		if (!bookingId || !targetProductId) return { ok: false, error: "validation_error" }

		const booking = await deps.repo.findOwnedBooking({ bookingId, userId })
		if (!booking) return { ok: false, error: "booking_not_found" }
		if (String(booking.status ?? "").toLowerCase() === "cancelled") {
			return { ok: false, error: "not_eligible" }
		}

		const target = await deps.repo.findProductById(targetProductId)
		if (!target || String(target.productType ?? "").toLowerCase() !== "tour") {
			return { ok: false, error: "not_eligible" }
		}

		const existing = await deps.repo.findAttributedMarketplaceEvent({
			bookingId,
			targetProductId,
		})
		if (existing) {
			return { ok: true, eventId: String(existing.id), idempotent: true }
		}
	}

	const eventId = randomUUID()
	await deps.repo.insertMarketplaceEvent({
		id: eventId,
		eventType,
		surface,
		sourceProductId,
		targetProductId,
		geoPlaceId,
		bookingId,
		sessionId,
		metaJson: input.meta ?? null,
	})

	return { ok: true, eventId, idempotent: false }
}
