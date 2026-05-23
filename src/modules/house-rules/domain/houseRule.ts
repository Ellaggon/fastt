export type HouseRuleType =
	| "Children"
	| "Pets"
	| "Smoking"
	| "Parties"
	| "QuietHours"
	| "Parking"
	| "CheckIn"
	| "Checkout"
	| "Safety"
	| "ExtraBeds"
	| "Access"
	| "Other"

export type ParkingType = "free" | "paid" | "street" | "assigned" | "nearby" | "none"
export type SmokingArea = "designated_areas" | "outdoors" | "rooms" | "not_allowed" | "other"
export type CheckInMethod = "self" | "host" | "front_desk" | "lockbox" | "smart_lock" | "manual"

export type HouseRulePayload = {
	kind: HouseRuleType
	allowed?: boolean
	feeNote?: string
	note?: string
	conditions?: string
	area?: SmokingArea
	start?: string
	end?: string
	available?: boolean
	parkingType?: ParkingType
	method?: CheckInMethod
	instructions?: string
	idRequired?: boolean
	cardRequired?: boolean
	time?: string
	tasks?: string[]
}

export interface HouseRule {
	id: string
	productId: string
	type: HouseRuleType
	description: string
	payloadJson?: HouseRulePayload | null
	createdAt: string
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const STRING_FIELDS = new Set([
	"feeNote",
	"note",
	"conditions",
	"area",
	"start",
	"end",
	"parkingType",
	"method",
	"instructions",
	"time",
])
const BOOLEAN_FIELDS = new Set(["allowed", "available", "idRequired", "cardRequired"])

function cleanText(value: unknown): string | undefined {
	const text = String(value ?? "").trim()
	return text || undefined
}

function cleanBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value
	if (value === "true" || value === "on" || value === "1") return true
	if (value === "false" || value === "0") return false
	return undefined
}

function cleanTasks(value: unknown): string[] | undefined {
	const raw = Array.isArray(value) ? value : String(value ?? "").split(",")
	const tasks = raw.map((item) => String(item ?? "").trim()).filter(Boolean)
	return tasks.length ? tasks : undefined
}

export function normalizeHouseRulePayload(
	type: HouseRuleType,
	input?: Partial<HouseRulePayload> | Record<string, unknown> | null
): HouseRulePayload | null {
	if (!input || typeof input !== "object") return null
	const payload: HouseRulePayload = { kind: type }
	for (const [key, value] of Object.entries(input)) {
		if (key === "kind") continue
		if (key === "tasks") {
			const tasks = cleanTasks(value)
			if (tasks) payload.tasks = tasks
			continue
		}
		if (BOOLEAN_FIELDS.has(key)) {
			const bool = cleanBoolean(value)
			if (typeof bool === "boolean") {
				;(payload as any)[key] = bool
			}
			continue
		}
		if (STRING_FIELDS.has(key)) {
			const text = cleanText(value)
			if (text) {
				;(payload as any)[key] = text
			}
		}
	}
	return payload
}

export function validateHouseRulePayload(type: HouseRuleType, payload: HouseRulePayload | null) {
	if (!payload) return
	if (payload.start && !TIME_PATTERN.test(payload.start))
		throw new Error("validation_error:quiet_hours_start_invalid")
	if (payload.end && !TIME_PATTERN.test(payload.end))
		throw new Error("validation_error:quiet_hours_end_invalid")
	if (payload.time && !TIME_PATTERN.test(payload.time))
		throw new Error("validation_error:checkout_time_invalid")

	if (
		["Pets", "Children", "Smoking", "Parties"].includes(type) &&
		typeof payload.allowed !== "boolean"
	) {
		throw new Error("validation_error:allowed_required")
	}
	if (type === "QuietHours" && (!payload.start || !payload.end)) {
		throw new Error("validation_error:quiet_hours_required")
	}
	if (type === "Parking" && typeof payload.available !== "boolean") {
		throw new Error("validation_error:parking_availability_required")
	}
	if (type === "CheckIn" && !payload.method && !payload.instructions) {
		throw new Error("validation_error:checkin_details_required")
	}
	if (type === "Checkout" && !payload.time && !payload.instructions && !payload.tasks?.length) {
		throw new Error("validation_error:checkout_details_required")
	}
}

function joinParts(parts: Array<string | undefined>): string {
	return parts.filter(Boolean).join(" ")
}

function parkingLabel(value?: string): string | undefined {
	const labels: Record<string, string> = {
		free: "Free parking is available.",
		paid: "Paid parking is available.",
		street: "Street parking is available; follow local signs and rules.",
		assigned: "Guests must use the assigned parking space.",
		nearby: "Nearby parking is available.",
		none: "Parking is not available at the property.",
	}
	return value ? labels[value] : undefined
}

function checkInMethodLabel(value?: string): string | undefined {
	const labels: Record<string, string> = {
		self: "Self check-in is available.",
		host: "Host-assisted check-in is used.",
		front_desk: "Guests check in at the front desk.",
		lockbox: "Guests access the property using a lockbox.",
		smart_lock: "Guests access the property using a smart lock or code.",
		manual: "Manual key handoff is required.",
	}
	return value ? labels[value] : undefined
}

export function buildHouseRuleGuestSummary(
	type: HouseRuleType,
	payload?: HouseRulePayload | null,
	fallbackDescription = ""
): string {
	if (!payload) return String(fallbackDescription ?? "").trim()

	switch (type) {
		case "Pets":
			return joinParts([
				payload.allowed ? "Pets are allowed." : "Pets are not allowed.",
				payload.feeNote,
				payload.note,
			])
		case "Children":
			return joinParts([
				payload.allowed ? "Children are welcome." : "Children are not allowed.",
				payload.conditions,
				payload.note,
			])
		case "Smoking": {
			const area =
				payload.allowed && payload.area === "designated_areas"
					? "Smoking is only allowed in designated areas."
					: payload.allowed && payload.area === "outdoors"
						? "Smoking is only allowed outdoors."
						: payload.allowed && payload.area === "rooms"
							? "Smoking is allowed in smoking-designated rooms."
							: payload.allowed
								? "Smoking is allowed where marked by the property."
								: "Smoking is not allowed."
			return joinParts([area, payload.note])
		}
		case "Parties":
			return joinParts([
				payload.allowed
					? "Parties and events are allowed with property guidance."
					: "Parties and events are not allowed.",
				payload.note,
			])
		case "QuietHours":
			return joinParts([
				payload.start && payload.end
					? `Quiet hours are from ${payload.start} to ${payload.end}.`
					: undefined,
				payload.note,
			])
		case "Parking":
			return joinParts([
				payload.available
					? (parkingLabel(payload.parkingType) ?? "Parking is available.")
					: "Parking is not available at the property.",
				payload.note,
			])
		case "CheckIn":
		case "Access":
			return joinParts([
				checkInMethodLabel(payload.method),
				payload.idRequired ? "A valid ID may be required at check-in." : undefined,
				payload.cardRequired ? "A payment card may be required at check-in." : undefined,
				payload.instructions,
				payload.note,
			])
		case "Checkout":
			return joinParts([
				payload.time ? `Checkout is by ${payload.time}.` : undefined,
				payload.tasks?.length ? `Before leaving: ${payload.tasks.join(", ")}.` : undefined,
				payload.instructions,
				payload.note,
			])
		default:
			return joinParts([payload.instructions, payload.note, fallbackDescription])
	}
}

export function isStructuredHouseRule(rule: Pick<HouseRule, "payloadJson">): boolean {
	return Boolean(rule.payloadJson && typeof rule.payloadJson === "object")
}
