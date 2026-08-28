/**
 * Pure, versioned authority for service codes persisted by ProductService.
 * It deliberately has no UI or Astro imports so API handlers, repositories and
 * tests can validate codes without loading presentation components.
 */
export const SERVICE_CODES = [
	"wifi",
	"streaming",
	"flat-tv",
	"coffee",
	"breakfast",
	"restaurant",
	"bar",
	"minibar",
	"kids-menu",
	"pool",
	"indoor-pool",
	"outdoor-pool",
	"spa",
	"sauna",
	"jacuzzi",
	"gym",
	"parking",
	"valet",
	"ev-charging",
	"shuttle",
	"airport-shuttle",
	"car-rental",
	"bike-rental",
	"boat-tours",
	"room-service",
	"24h-room-service",
	"laundry",
	"dryclean",
	"daily-cleaning",
	"24h-reception",
	"concierge",
	"business-center",
	"meeting-rooms",
	"wedding",
	"luggage",
	"accessible",
	"elevator",
	"kids-club",
	"babysitting",
	"highchair",
	"fridge",
	"inroom-safe",
	"ironing",
	"wakeup",
	"ATM",
	"currency-exchange",
	"business-services",
	"tour-desk",
	"terrace",
	"rooftop",
	"fireplace",
	"evoucher",
	"safety-railings",
] as const

export type ServiceId = (typeof SERVICE_CODES)[number]

const serviceCodeSet = new Set<string>(SERVICE_CODES)

export function isServiceId(value: string): value is ServiceId {
	return serviceCodeSet.has(value)
}

export function unknownServiceIds(serviceIds: Iterable<string>): string[] {
	return [...new Set([...serviceIds].map((serviceId) => serviceId.trim()).filter(Boolean))]
		.filter((serviceId) => !isServiceId(serviceId))
		.sort()
}
