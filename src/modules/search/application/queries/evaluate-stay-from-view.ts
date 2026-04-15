export type SearchUnitViewStayRow = {
	date: string
	isSellable: boolean
	isAvailable: boolean
	hasAvailability: boolean
	hasPrice: boolean
	stopSell: boolean
	availableUnits: number
	minStay: number | null
	cta: boolean
	ctd: boolean
	primaryBlocker: string | null
	pricePerNight: number | null
}

export type StaySellabilityEvaluation = {
	sellable: boolean
	primaryBlocker: string | null
	failingDate: string | null
}

export function evaluateStaySellabilityFromView(params: {
	stayDates: string[]
	checkInDate: string
	checkOutDate: string
	requestedRooms: number
	rowsByDate: Map<string, SearchUnitViewStayRow>
}): StaySellabilityEvaluation {
	const requestedRooms = Math.max(1, Number(params.requestedRooms ?? 1))
	const stayDays: SearchUnitViewStayRow[] = []
	for (const date of params.stayDates) {
		const day = params.rowsByDate.get(date)
		if (!day) {
			return {
				sellable: false,
				primaryBlocker: "UNKNOWN",
				failingDate: date,
			}
		}
		stayDays.push(day)
	}

	const checkInDay = params.rowsByDate.get(params.checkInDate)
	if (!checkInDay) {
		return {
			sellable: false,
			primaryBlocker: "UNKNOWN",
			failingDate: params.checkInDate,
		}
	}
	if (checkInDay.cta) {
		return {
			sellable: false,
			primaryBlocker: "CTA",
			failingDate: params.checkInDate,
		}
	}

	const checkOutDay = params.rowsByDate.get(params.checkOutDate)
	if (!checkOutDay) {
		return {
			sellable: false,
			primaryBlocker: "UNKNOWN",
			failingDate: params.checkOutDate,
		}
	}
	if (checkOutDay.ctd) {
		return {
			sellable: false,
			primaryBlocker: "CTD",
			failingDate: params.checkOutDate,
		}
	}

	const minStay = checkInDay.minStay == null ? 1 : Math.max(1, Number(checkInDay.minStay))
	if (params.stayDates.length < minStay) {
		return {
			sellable: false,
			primaryBlocker: "MIN_STAY_NOT_MET",
			failingDate: params.checkInDate,
		}
	}

	for (const day of stayDays) {
		const daySellable =
			Boolean(day.isSellable) &&
			Boolean(day.isAvailable) &&
			Boolean(day.hasAvailability) &&
			Boolean(day.hasPrice) &&
			!Boolean(day.stopSell) &&
			Math.max(0, Number(day.availableUnits ?? 0)) >= requestedRooms
		if (!daySellable) {
			return {
				sellable: false,
				primaryBlocker: String(day.primaryBlocker ?? "UNKNOWN"),
				failingDate: day.date,
			}
		}
	}

	return {
		sellable: true,
		primaryBlocker: null,
		failingDate: null,
	}
}
