import type { GuestTripQueryRepositoryPort } from "../ports/GuestTripQueryRepositoryPort"
import { buildBookingReceipt } from "./build-booking-receipt"
import { isPriceQuote } from "@/modules/pricing/public"

export type GuestTripConfirmation = {
	bookingId: string
	status: string
	operationalStatus: string
	checkedInAt: string | null
	productId: string | null
	geoPlaceId: string | null
	productName: string
	salidaName: string
	departureDate: string
	departureTime: string | null
	participants: { adults: number; children: number; infants: number }
	totalAmount: number
	currency: string
	guestEmail: string | null
	meetingPoint: Record<string, unknown> | null
	voucher: {
		code: string
		status: string
		qrPayload: string | null
		note: string | null
		instructions: Record<string, unknown>
	} | null
	receipt: ReturnType<typeof buildBookingReceipt> | null
	review: {
		eligible: boolean
		existingReviewId: string | null
		existingStatus: string | null
		reason: string | null
	}
}

/**
 * Guest confirmation is authorized only by Booking.userId.
 * All tour day-of content is read from frozen snapshots (never live Tour rows).
 */
export async function getGuestTripConfirmation(
	deps: { repo: GuestTripQueryRepositoryPort },
	params: {
		bookingId: string
		userId: string
	}
): Promise<GuestTripConfirmation | null> {
	const bookingId = String(params.bookingId ?? "").trim()
	const userId = String(params.userId ?? "").trim()
	if (!bookingId || !userId) return null

	const bundle = await deps.repo.loadOwnedTripBundle({ bookingId, userId })
	if (!bundle) return null

	const { booking, line, voucher, existingReview } = bundle
	const contact = (booking.guestContactSnapshotJson ?? {}) as Record<string, any>
	const instructions = (voucher?.instructionsJson ?? {}) as Record<string, any>
	const occupancySnap =
		line?.occupancySnapshotJson && typeof line.occupancySnapshotJson === "object"
			? (line.occupancySnapshotJson as Record<string, any>)
			: null
	const meetingPointRaw =
		contact.meetingPoint && typeof contact.meetingPoint === "object"
			? contact.meetingPoint
			: instructions.meetingPoint && typeof instructions.meetingPoint === "object"
				? instructions.meetingPoint
				: null
	const priceQuote = (line?.pricingBreakdownJson as any)?.priceQuote

	const productId = String(line?.productIdSnapshot ?? line?.productId ?? "").trim() || null
	const productType = String(line?.productType ?? "")
		.trim()
		.toLowerCase()
	const voucherStatus = String(voucher?.status ?? "").toLowerCase()
	const bookingStatus = String(booking.status ?? "").toLowerCase()
	const attended = Boolean(booking.checkedInAt) || voucherStatus === "redeemed"
	const finalized = bookingStatus === "confirmed" || Boolean(booking.checkedInAt) || attended

	let reviewReason: string | null = null
	let eligible = false
	if (existingReview) {
		reviewReason = "already_reviewed"
	} else if (productType !== "tour") {
		reviewReason = "not_tour"
	} else if (bookingStatus === "cancelled") {
		reviewReason = "cancelled"
	} else if (!finalized) {
		reviewReason = "not_confirmed"
	} else if (!attended) {
		reviewReason = "not_attended"
	} else {
		eligible = true
	}

	return {
		bookingId: booking.id,
		status: String(booking.status ?? ""),
		operationalStatus: String(booking.operationalStatus ?? ""),
		checkedInAt: booking.checkedInAt ? new Date(booking.checkedInAt).toISOString() : null,
		productId,
		geoPlaceId: line?.geoPlaceId == null ? null : String(line.geoPlaceId),
		productName: String(
			contact.productName ?? line?.productNameSnapshot ?? instructions.productName ?? "Experiencia"
		).trim(),
		salidaName: String(contact.variantName ?? line?.variantNameSnapshot ?? "Salida").trim(),
		departureDate: String(
			contact.departureDate ?? booking.checkInDate ?? instructions.departureDate ?? ""
		).trim(),
		departureTime: (() => {
			const value = String(contact.departureTime ?? instructions.departureTime ?? "").trim()
			return value || null
		})(),
		participants: {
			adults: Number(
				occupancySnap?.adults ??
					booking.numAdults ??
					line?.adults ??
					instructions.participants?.adults ??
					1
			),
			children: Number(
				occupancySnap?.children ??
					booking.numChildren ??
					line?.children ??
					instructions.participants?.children ??
					0
			),
			infants: Number(
				occupancySnap?.infants ??
					instructions.participants?.infants ??
					contact.occupancyDetail?.infants ??
					0
			),
		},
		totalAmount: Number(booking.totalAmount ?? line?.totalAmount ?? 0),
		currency: String(booking.currency ?? "USD").toUpperCase(),
		guestEmail: booking.guestEmailSnapshot == null ? null : String(booking.guestEmailSnapshot),
		meetingPoint: meetingPointRaw as Record<string, unknown> | null,
		voucher: voucher
			? {
					code: String(voucher.code ?? ""),
					status: String(voucher.status ?? ""),
					qrPayload: voucher.qrPayload == null ? null : String(voucher.qrPayload),
					note: instructions.note == null ? null : String(instructions.note),
					instructions,
				}
			: null,
		receipt: isPriceQuote(priceQuote)
			? buildBookingReceipt({
					bookingId: booking.id,
					status: String(booking.status ?? "confirmed"),
					issuedAt: booking.checkedInAt ?? null,
					quote: priceQuote,
				})
			: null,
		review: {
			eligible,
			existingReviewId: existingReview ? String(existingReview.id) : null,
			existingStatus: existingReview ? String(existingReview.status) : null,
			reason: reviewReason,
		},
	}
}
