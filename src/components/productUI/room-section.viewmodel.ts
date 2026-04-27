export type RoomSectionRatePlanRow = {
	variantId: string
	variantName: string
	ratePlanId: string
	ratePlanName: string
	totalPrice: number | null
	nightlyPrice: number | null
	nights: number
	policySummary: string
	policyCancellation: string
	policyPayment: string
	isRecommended: boolean
	isSellable: boolean
	availabilityLabel: "Disponible" | "No disponible"
	availabilityTone: "success" | "danger"
	imageUrl: string
	roomMeta: {
		sizeM2: string
		view: string
		beds: string
		bathrooms: string
		occupancy: string
	}
}

export function computeNights(from: string, to: string): number {
	const fromDate = new Date(`${String(from)}T00:00:00.000Z`)
	const toDate = new Date(`${String(to)}T00:00:00.000Z`)
	if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return 0
	return Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000))
}

function toFiniteNumber(value: unknown): number | null {
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

function toMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100
}

export function toRoomSectionRows(params: {
	offers: any[]
	hotelRoom: any[]
	nights: number
	fallbackImage: string
}): RoomSectionRatePlanRow[] {
	const nights = Math.max(0, Number(params.nights || 0))
	const rows: RoomSectionRatePlanRow[] = []

	for (const offer of params.offers ?? []) {
		const variantId = String(offer?.variantId ?? offer?.variant?.id ?? "").trim()
		if (!variantId) continue
		const variantName = String(offer?.variant?.name ?? "Habitación").trim()
		const roomMetaRaw =
			(params.hotelRoom ?? []).find((room: any) => String(room?.id ?? "") === variantId) ?? {}
		const variantImages = Array.isArray(offer?.variantImages) ? offer.variantImages : []
		const imageUrl =
			String(
				variantImages.find((img: any) => Boolean(img?.isPrimary))?.url ??
					variantImages[0]?.url ??
					params.fallbackImage ??
					"https://placehold.co/800x600?text=Sin+imagen"
			) || "https://placehold.co/800x600?text=Sin+imagen"

		const ratePlans = Array.isArray(offer?.ratePlans) ? offer.ratePlans : []
		for (const ratePlan of ratePlans) {
			const ratePlanId = String(ratePlan?.ratePlanId ?? ratePlan?.id ?? "").trim()
			if (!ratePlanId) continue
			const totalPriceRaw = toFiniteNumber(
				ratePlan?.totalPrice ?? ratePlan?.finalPrice ?? ratePlan?.basePrice ?? ratePlan?.price
			)
			const totalPrice = totalPriceRaw == null ? null : toMoney(totalPriceRaw)
			const nightlyPrice = totalPrice != null && nights > 0 ? toMoney(totalPrice / nights) : null
			const isSellable = totalPrice != null && totalPrice > 0 && nights > 0

			rows.push({
				variantId,
				variantName,
				ratePlanId,
				ratePlanName: String(ratePlan?.name ?? "Tarifa").trim(),
				totalPrice,
				nightlyPrice,
				nights,
				policySummary: String(ratePlan?.policySummary ?? "Condiciones según política"),
				policyCancellation: String(ratePlan?.policyHighlights?.cancellation ?? "Según política"),
				policyPayment: String(ratePlan?.policyHighlights?.payment ?? "Según política"),
				isRecommended: Boolean(ratePlan?.isRecommended),
				isSellable,
				availabilityLabel: isSellable ? "Disponible" : "No disponible",
				availabilityTone: isSellable ? "success" : "danger",
				imageUrl,
				roomMeta: {
					sizeM2:
						roomMetaRaw?.sizeM2 != null && String(roomMetaRaw.sizeM2).trim().length > 0
							? `${roomMetaRaw.sizeM2} m²`
							: "Tamaño no especificado",
					view:
						roomMetaRaw?.hasView != null && String(roomMetaRaw.hasView).trim().length > 0
							? `Vista: ${roomMetaRaw.hasView}`
							: "Vista no especificada",
					beds:
						Array.isArray(roomMetaRaw?.bedType) && roomMetaRaw.bedType.length > 0
							? roomMetaRaw.bedType.map((bed: any) => `${bed.count} ${bed.id}`).join(", ")
							: "Tipo de cama no especificado",
					bathrooms:
						roomMetaRaw?.bathroom != null
							? `${roomMetaRaw.bathroom} baño${Number(roomMetaRaw.bathroom) > 1 ? "s" : ""}`
							: "Baños no especificados",
					occupancy:
						roomMetaRaw?.maxOccupancy != null
							? `${roomMetaRaw.maxOccupancy} persona${Number(roomMetaRaw.maxOccupancy) > 1 ? "s" : ""}`
							: "Capacidad no especificada",
				},
			})
		}
	}

	return rows
}

export function resolveInitialSelection(
	rows: RoomSectionRatePlanRow[],
	query: { variantId?: string; ratePlanId?: string }
): { variantId: string; ratePlanId: string } {
	const variantId = String(query?.variantId ?? "").trim()
	const ratePlanId = String(query?.ratePlanId ?? "").trim()
	if (variantId && ratePlanId) {
		const hit = rows.find((row) => row.variantId === variantId && row.ratePlanId === ratePlanId)
		if (hit) return { variantId, ratePlanId }
	}
	if (variantId) {
		const hit = rows.find((row) => row.variantId === variantId && row.isSellable)
		if (hit) return { variantId: hit.variantId, ratePlanId: hit.ratePlanId }
	}
	const firstSellable = rows.find((row) => row.isSellable)
	if (firstSellable) {
		return { variantId: firstSellable.variantId, ratePlanId: firstSellable.ratePlanId }
	}
	const firstAny = rows[0]
	return {
		variantId: firstAny?.variantId ?? "",
		ratePlanId: firstAny?.ratePlanId ?? "",
	}
}

export function buildHoldRequest(params: {
	variantId: string
	ratePlanId: string
	from: string
	to: string
	occupancy: number
}) {
	return {
		variantId: String(params.variantId).trim(),
		ratePlanId: String(params.ratePlanId).trim(),
		dateRange: {
			from: String(params.from).trim(),
			to: String(params.to).trim(),
		},
		occupancy: Math.max(1, Number(params.occupancy ?? 1)),
	}
}
