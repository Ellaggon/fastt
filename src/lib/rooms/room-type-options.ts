import { ROOM_TYPES } from "@/data/room/room-types"

export type RoomTypeOption = {
	id: string
	name: string
	maxOccupancy: number | null
}

function normalizedName(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLocaleLowerCase("es")
}

/** Keeps the selector canonical without invalidating a legacy selected type. */
export function resolveRoomTypeOptions(
	rows: RoomTypeOption[],
	selectedRoomTypeId?: string | null
): RoomTypeOption[] {
	const rowsById = new Map(rows.map((row) => [row.id, row]))
	const canonicalIds = new Set<string>(ROOM_TYPES.map((roomType) => roomType.id))
	const canonicalNames = new Set(ROOM_TYPES.map((roomType) => normalizedName(roomType.name)))
	const selectedId = String(selectedRoomTypeId ?? "").trim()
	const canonical = ROOM_TYPES.flatMap((roomType) =>
		rowsById.has(roomType.id)
			? [{ id: roomType.id, name: roomType.name, maxOccupancy: roomType.maxOccupancy }]
			: []
	)
	const custom = rows
		.filter(
			(row) =>
				!canonicalIds.has(row.id) &&
				!canonicalNames.has(normalizedName(row.name)) &&
				row.id !== selectedId
		)
		.sort((a, b) => a.name.localeCompare(b.name, "es"))
	const selectedLegacy = selectedId ? rowsById.get(selectedId) : null

	return selectedLegacy && !canonical.some((row) => row.id === selectedId)
		? [...canonical, ...custom, selectedLegacy]
		: [...canonical, ...custom]
}
