import { AMENITY_ROOMS } from "@/data/room/room-amenity"

export type RoomAmenityOption = {
	id: string
	name: string
	category: string | null
}

function normalized(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLocaleLowerCase("es")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function amenityKey(option: Pick<RoomAmenityOption, "name" | "category">) {
	const name = normalized(option.name)
	const wifi = /^(wifi|wi fi)( gratis| gratuito| en la habitacion)?$/.test(name)
	return `${normalized(option.category ?? "General")}:${wifi ? "wifi" : name}`
}

/** Keeps the selector canonical without invalidating a legacy room selection. */
export function resolveRoomAmenityOptions(
	rows: RoomAmenityOption[],
	selectedAmenityIds: string[] = []
): RoomAmenityOption[] {
	const selectedIds = new Set(selectedAmenityIds.map(String))
	const canonicalIds = new Set<string>(AMENITY_ROOMS.map((amenity) => amenity.id))
	const priority = (option: RoomAmenityOption) => {
		if (selectedIds.has(option.id)) return 0
		if (canonicalIds.has(option.id)) return 1
		return 2
	}
	const ordered = [...rows].sort((a, b) => {
		const priorityDelta = priority(a) - priority(b)
		if (priorityDelta !== 0) return priorityDelta
		return `${a.category ?? ""}:${a.name}`.localeCompare(`${b.category ?? ""}:${b.name}`, "es")
	})
	const uniqueByGuestFacingAmenity = new Map<string, RoomAmenityOption>()
	for (const option of ordered) {
		const key = amenityKey(option)
		if (!uniqueByGuestFacingAmenity.has(key)) uniqueByGuestFacingAmenity.set(key, option)
	}

	return Array.from(uniqueByGuestFacingAmenity.values()).sort((a, b) => {
		const category = String(a.category ?? "General").localeCompare(
			String(b.category ?? "General"),
			"es"
		)
		return category !== 0 ? category : a.name.localeCompare(b.name, "es")
	})
}
