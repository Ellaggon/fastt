const ROOM_TYPE_PREFIXES: Record<string, string> = {
	single: "SGL",
	double: "DBL",
	twin: "TWN",
	triple: "TPL",
	quad: "QUAD",
	queen: "QEN",
	king: "KNG",
	suite: "STE",
	junior_suite: "JST",
	family_suite: "FAM",
	studio: "STD",
	apartment: "APT",
	villa: "VLA",
	bungalow: "BNG",
	penthouse: "PTH",
	duplex: "DPX",
	connecting: "CON",
	accessible: "ACC",
	deluxe: "DLX",
	executive: "EXE",
	presidential_suite: "PST",
	loft: "LFT",
	cabana: "CBN",
	tent: "TNT",
	dormitory: "DRM",
}

export function normalizeRoomInternalCode(value: string | null | undefined): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toUpperCase()
	return normalized || null
}

export function getRoomInternalCodePrefix(roomTypeId?: string | null): string {
	const normalizedRoomTypeId = String(roomTypeId ?? "")
		.trim()
		.toLowerCase()
	return ROOM_TYPE_PREFIXES[normalizedRoomTypeId] ?? "ROOM"
}

export function buildAutomaticRoomInternalCode(params: {
	roomTypeId?: string | null
	variantId: string
}): string {
	const prefix = getRoomInternalCodePrefix(params.roomTypeId)
	const token = params.variantId
		.replace(/[^a-z0-9]/gi, "")
		.toUpperCase()
		.slice(0, 8)

	if (!token) throw new Error("No se pudo generar el código interno de la habitación.")
	return `${prefix}-${token}`
}
