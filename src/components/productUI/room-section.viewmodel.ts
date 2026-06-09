import { formatBedType } from "@/data/room/room-beds"

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

export type GuestRoomAmenityRow = {
	roomId?: string | null
	variantId?: string | null
	amenityName?: string | null
	category?: string | null
	isAvailable?: boolean | null
}

export type GuestRoomSleepArea = {
	label: string
	summary: string
	items: string[]
}

export type GuestRoomPreview = {
	variantId: string
	roomName: string
	roomTypeName: string
	imageUrl: string
	gallery: { id: string; url: string; order: number; isPrimary: boolean }[]
	sleepSummary: string
	sleepAreas: GuestRoomSleepArea[]
	bathroomSummary: string
	occupancySummary: string
	sizeSummary: string
	viewSummary: string
	amenityLabels: string[]
	amenityGroups: { category: string; labels: string[] }[]
	guestFacingNotes: string
	hasBalcony: boolean
}

export function computeNights(from: string, to: string): number {
	const fromDate = new Date(`${String(from)}T00:00:00.000Z`)
	const toDate = new Date(`${String(to)}T00:00:00.000Z`)
	if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return 0
	return Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000))
}

function normalizeGallery(
	variantImages: any[],
	productFallbackImage: string,
	productFallbackGallery: string[] = []
): { id: string; url: string; order: number; isPrimary: boolean }[] {
	const images = (Array.isArray(variantImages) ? variantImages : [])
		.map((image: any, index: number) => ({
			id: String(image?.id ?? `variant-${index}`),
			url: String(image?.url ?? "").trim(),
			order: Number(image?.order ?? index),
			isPrimary: Boolean(image?.isPrimary),
		}))
		.filter((image) => image.url.length > 0)
		.sort((a, b) => a.order - b.order)

	if (images.length > 0) return images

	const fallbackGallery = (Array.isArray(productFallbackGallery) ? productFallbackGallery : [])
		.map((url, index) => ({
			id: `fallback-${index}`,
			url: String(url ?? "").trim(),
			order: index,
			isPrimary: index === 0,
		}))
		.filter((image) => image.url.length > 0)

	if (fallbackGallery.length > 0) return fallbackGallery

	const fallback = String(productFallbackImage ?? "").trim()
	return fallback
		? [{ id: "fallback", url: fallback, order: 0, isPrimary: true }]
		: [
				{
					id: "placeholder",
					url: "https://placehold.co/1200x800?text=Habitacion",
					order: 0,
					isPrimary: true,
				},
			]
}

function formatGuestBeds(room: any): GuestRoomSleepArea[] {
	const beds = Array.isArray(room?.beds)
		? room.beds
		: Array.isArray(room?.bedType)
			? room.bedType
			: []

	if (!beds.length) return []

	const grouped = new Map<string, { id: string; count: number }[]>()
	for (const bed of beds) {
		const roomLabel = String(bed?.roomLabel ?? "").trim() || "Dormitorio"
		const id = String(bed?.id ?? bed?.bedType ?? bed?.type ?? "single").trim()
		const count = Number(bed?.count ?? 1)
		const safeCount = Number.isFinite(count) && count > 0 ? count : 1
		grouped.set(roomLabel, [...(grouped.get(roomLabel) ?? []), { id, count: safeCount }])
	}

	return Array.from(grouped.entries()).map(([label, items]) => {
		const summary = formatBedType(items).replace(/\n/g, ", ")
		return {
			label,
			summary,
			items: items.map((item) => formatBedType([item]).replace(/\n/g, ", ")),
		}
	})
}

function formatBathroomType(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
	const labels: Record<string, string> = {
		private: "privado",
		shared: "compartido",
		ensuite: "en suite",
		dedicated: "dedicado",
		unknown: "",
	}
	return labels[normalized] ?? normalized
}

function formatBathroomSummary(room: any): string {
	const count = Number(room?.bathroomCount ?? room?.bathroom)
	const type = formatBathroomType(room?.bathroomType)
	if (!Number.isFinite(count) || count <= 0) return type ? `Baño ${type}` : "Baño por confirmar"
	const base = `${count} baño${count > 1 ? "s" : ""}`
	return type ? `${base} ${type}` : base
}

function formatOccupancySummary(room: any, offer: any): string {
	const count = Number(room?.maxOccupancy ?? offer?.variant?.maxOccupancy ?? 0)
	return Number.isFinite(count) && count > 0
		? `Hasta ${count} huésped${count > 1 ? "es" : ""}`
		: "Capacidad por confirmar"
}

function formatSizeSummary(room: any): string {
	const value = Number(room?.sizeM2)
	return Number.isFinite(value) && value > 0 ? `${value} m²` : ""
}

function formatViewSummary(room: any): string {
	const view = String(room?.viewType ?? room?.hasView ?? "").trim()
	return view ? `Vista ${view}` : ""
}

function groupAmenities(amenities: GuestRoomAmenityRow[]) {
	const grouped = new Map<string, string[]>()
	for (const amenity of amenities) {
		if (amenity.isAvailable === false) continue
		const label = String(amenity.amenityName ?? "").trim()
		if (!label) continue
		const category = String(amenity.category ?? "").trim() || "Comodidades"
		if (!grouped.has(category)) grouped.set(category, [])
		const values = grouped.get(category) ?? []
		if (!values.includes(label)) values.push(label)
		grouped.set(category, values)
	}
	return Array.from(grouped.entries()).map(([category, labels]) => ({ category, labels }))
}

export function buildGuestRoomPreviews(params: {
	offers: any[]
	hotelRoom: any[]
	amenities?: GuestRoomAmenityRow[]
	productFallbackImage: string
	productFallbackGallery?: string[]
}): GuestRoomPreview[] {
	const previews: GuestRoomPreview[] = []
	const seen = new Set<string>()

	for (const offer of params.offers ?? []) {
		const variantId = String(offer?.variantId ?? offer?.variant?.id ?? "").trim()
		if (!variantId || seen.has(variantId)) continue
		seen.add(variantId)

		const room =
			(params.hotelRoom ?? []).find(
				(candidate: any) => String(candidate?.id ?? candidate?.variantId ?? "").trim() === variantId
			) ?? {}
		const gallery = normalizeGallery(
			Array.isArray(offer?.variantImages) ? offer.variantImages : [],
			params.productFallbackImage,
			params.productFallbackGallery
		)
		const sleepAreas = formatGuestBeds(room)
		const roomAmenities = (params.amenities ?? []).filter((amenity) => {
			const roomId = String(amenity.roomId ?? amenity.variantId ?? "").trim()
			return roomId === variantId
		})
		const amenityGroups = groupAmenities(roomAmenities)
		const amenityLabels = amenityGroups.flatMap((group) => group.labels)
		const roomName = String(offer?.variant?.name ?? offer?.name ?? "Habitación").trim()
		const roomTypeName = String(room?.roomTypeName ?? room?.typeName ?? "").trim()

		previews.push({
			variantId,
			roomName,
			roomTypeName,
			imageUrl: gallery.find((image) => image.isPrimary)?.url ?? gallery[0]?.url ?? "",
			gallery,
			sleepSummary: sleepAreas.length
				? sleepAreas.map((area) => area.summary).join(" · ")
				: "Camas por confirmar",
			sleepAreas,
			bathroomSummary: formatBathroomSummary(room),
			occupancySummary: formatOccupancySummary(room, offer),
			sizeSummary: formatSizeSummary(room),
			viewSummary: formatViewSummary(room),
			amenityLabels,
			amenityGroups,
			guestFacingNotes: String(room?.guestFacingNotes ?? "").trim(),
			hasBalcony: Boolean(room?.hasBalcony),
		})
	}

	return previews
}

function toFiniteNumber(value: unknown): number | null {
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

function toMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatBeds(room: any): string {
	const beds = Array.isArray(room?.beds)
		? room.beds
		: Array.isArray(room?.bedType)
			? room.bedType
			: []
	if (!beds.length) return "Tipo de cama no especificado"
	return beds
		.map((bed: any) => {
			const count = Number(bed?.count ?? 1)
			const label = String(bed?.id ?? bed?.bedType ?? bed?.type ?? "cama").trim()
			return `${Number.isFinite(count) && count > 0 ? count : 1} ${label}`
		})
		.join(", ")
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
				policySummary: String(ratePlan?.policySummary ?? "Condiciones según configuración"),
				policyCancellation: String(ratePlan?.policyHighlights?.cancellation ?? "Según condición"),
				policyPayment: String(ratePlan?.policyHighlights?.payment ?? "Según condición"),
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
						(roomMetaRaw?.viewType ?? roomMetaRaw?.hasView) != null &&
						String(roomMetaRaw.viewType ?? roomMetaRaw.hasView).trim().length > 0
							? `Vista: ${roomMetaRaw.viewType ?? roomMetaRaw.hasView}`
							: "Vista no especificada",
					beds: formatBeds(roomMetaRaw),
					bathrooms:
						(roomMetaRaw?.bathroomCount ?? roomMetaRaw?.bathroom) != null
							? `${roomMetaRaw.bathroomCount ?? roomMetaRaw.bathroom} baño${Number(roomMetaRaw.bathroomCount ?? roomMetaRaw.bathroom) > 1 ? "s" : ""}`
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
