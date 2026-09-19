import { normalizeProductVertical } from "@/lib/catalog/productVerticalRegistry"
import type { ActiveWorkspaceVertical } from "@/lib/workspace/verticalContext"

export type DashboardProductLike = {
	id: string
	type: string
}

export type DashboardPreparationLike = {
	isPublished?: boolean
	readyToPublish?: boolean
} | null

export function filterProductsForWorkspaceScope<T extends DashboardProductLike>(
	products: readonly T[],
	operationalVertical: ActiveWorkspaceVertical | null
): T[] {
	if (!operationalVertical) return [...products]
	return products.filter(
		(product) => normalizeProductVertical(product.type) === operationalVertical
	)
}

export function isDashboardSetupHome(
	products: readonly DashboardProductLike[],
	preparationById: ReadonlyMap<string, DashboardPreparationLike>
): boolean {
	if (products.length === 0) return false
	return products.every((product) => {
		const preparation = preparationById.get(product.id)
		return !preparation?.isPublished && !preparation?.readyToPublish
	})
}

export function resolveDashboardHomeCopy(input: {
	isChoosingForAddRoom: boolean
	isSetupHome: boolean
	hasHotel: boolean
	hasTour: boolean
	hotelCount: number
	tourCount: number
	productCount: number
	hasTodayOperations?: boolean
}): { title: string; intro: string } {
	if (input.isChoosingForAddRoom) {
		return {
			title: "Elige dónde crear la habitación",
			intro: "Selecciona el alojamiento donde agregarás una nueva habitación.",
		}
	}
	if (input.productCount === 0) {
		return {
			title: "Resumen",
			intro: "Añade tu primer servicio para empezar a operar.",
		}
	}
	if (input.isSetupHome) {
		if (input.hasTour && !input.hasHotel) {
			return {
				title: input.tourCount === 1 ? "Prepara tu tour" : "Prepara tus tours",
				intro:
					"Termina la ficha para publicarla. La operación diaria aparece cuando el tour esté listo.",
			}
		}
		if (input.hasHotel && !input.hasTour) {
			return {
				title: input.hotelCount === 1 ? "Prepara tu alojamiento" : "Prepara tus alojamientos",
				intro:
					"Termina la ficha para publicarla. La operación diaria aparece cuando el alojamiento esté listo.",
			}
		}
		return {
			title: "Prepara tus servicios",
			intro:
				"Termina cada ficha para publicarla. El resumen operativo aparece cuando haya una oferta lista.",
		}
	}
	if (input.hasTodayOperations) {
		return {
			title: "Hoy",
			intro: "Llegadas, salidas y pagos que requieren atención hoy.",
		}
	}
	return {
		title: "Resumen",
		intro: "Cuando alguien reserve, este resumen se convierte en tu día operativo.",
	}
}

export type DashboardTodayBookingLike = {
	bookingId: string
	guestName?: string | null
	productName?: string | null
	checkIn?: string | null
	checkOut?: string | null
	lifecycleState?: string | null
	vertical?: string | null
	payment?: { pendingAmount?: number | null } | null
}

export type DashboardTodaySummary = {
	hasAnyBookings: boolean
	arrivalsToday: number
	departuresToday: number
	inProgress: number
	pendingPayment: number
	agenda: Array<{
		bookingId: string
		guestName: string
		productName: string
		checkIn: string
		checkOut: string
	}>
}

export function summarizeDashboardToday(
	items: readonly DashboardTodayBookingLike[],
	today: string
): DashboardTodaySummary {
	const active = items.filter((item) => {
		const lifecycle = String(item.lifecycleState ?? "")
		return lifecycle !== "cancelled" && lifecycle !== "unknown"
	})
	const agenda = active.filter((item) => {
		const lifecycle = String(item.lifecycleState ?? "")
		return (
			item.checkIn === today ||
			item.checkOut === today ||
			lifecycle === "in_house" ||
			lifecycle === "departure_due"
		)
	})
	return {
		hasAnyBookings: active.length > 0,
		arrivalsToday: active.filter((item) => item.checkIn === today).length,
		departuresToday: active.filter((item) => item.checkOut === today).length,
		inProgress: active.filter((item) => item.lifecycleState === "in_house").length,
		pendingPayment: active.filter((item) => Number(item.payment?.pendingAmount ?? 0) > 0).length,
		agenda: agenda.slice(0, 4).map((item) => ({
			bookingId: item.bookingId,
			guestName: String(item.guestName || "Huésped por registrar"),
			productName: String(item.productName || "Reserva"),
			checkIn: String(item.checkIn || ""),
			checkOut: String(item.checkOut || ""),
		})),
	}
}

export function shiftIsoDate(isoDate: string, days: number) {
	const date = new Date(`${isoDate}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}
