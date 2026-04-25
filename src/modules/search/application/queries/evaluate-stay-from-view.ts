import { ReasonCode, type SearchSellabilityDTO } from "../dto/SearchSellabilityDTO"

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

export type StaySellabilityEvaluation = SearchSellabilityDTO

function mapPrimaryBlockerToReasonCode(primaryBlocker: string | null | undefined): ReasonCode {
	const value = String(primaryBlocker ?? "")
		.trim()
		.toUpperCase()
	if (!value) return ReasonCode.MISSING_COVERAGE
	if (value === "CTA") return ReasonCode.CTA_RESTRICTION
	if (value === "CTD") return ReasonCode.CTD_RESTRICTION
	if (value === "MIN_STAY_NOT_MET") return ReasonCode.MIN_STAY_NOT_MET
	if (value === "MISSING_PRICE" || value === "NO_PRICE") return ReasonCode.PRICE_NOT_AVAILABLE
	if (value === "NO_INVENTORY" || value === "NO_CAPACITY" || value === "CLOSED")
		return ReasonCode.NO_INVENTORY
	if (value === "STALE_VIEW") return ReasonCode.STALE_VIEW
	if (value.includes("POLICY")) return ReasonCode.POLICY_BLOCKED
	return ReasonCode.MISSING_COVERAGE
}

function withReason(
	base: Omit<SearchSellabilityDTO, "reasonCodes" | "isSellable">,
	reasonCode: ReasonCode
): SearchSellabilityDTO {
	return {
		...base,
		isSellable: false,
		reasonCodes: [reasonCode],
		policies: {
			isCompliant: reasonCode !== ReasonCode.POLICY_BLOCKED,
		},
	}
}

export function evaluateStaySellabilityFromView(params: {
	stayDates: string[]
	checkInDate: string
	requestedRooms: number
	rowsByDate: Map<string, SearchUnitViewStayRow>
	currency?: string
}): StaySellabilityEvaluation {
	const requestedRooms = Math.max(1, Number(params.requestedRooms ?? 1))
	const currency =
		String(params.currency ?? "USD")
			.trim()
			.toUpperCase() || "USD"
	const base: Omit<SearchSellabilityDTO, "reasonCodes" | "isSellable"> = {
		price: {
			base: null,
			display: null,
		},
		availability: {
			hasInventory: false,
			hasRestrictions: false,
		},
		policies: {
			isCompliant: true,
		},
	}
	if (!params.stayDates.length) {
		return withReason(base, ReasonCode.MISSING_COVERAGE)
	}
	const stayDays: SearchUnitViewStayRow[] = []
	for (const date of params.stayDates) {
		const day = params.rowsByDate.get(date)
		if (!day) {
			return withReason(
				{
					...base,
					diagnostics: {
						missingCoverage: true,
					},
				},
				ReasonCode.MISSING_COVERAGE
			)
		}
		stayDays.push(day)
	}

	const checkInDay = params.rowsByDate.get(params.checkInDate)
	if (!checkInDay) {
		return withReason(
			{
				...base,
				diagnostics: {
					missingCoverage: true,
				},
			},
			ReasonCode.MISSING_COVERAGE
		)
	}
	if (checkInDay.cta) {
		return withReason(
			{
				...base,
				availability: {
					hasInventory: true,
					hasRestrictions: true,
				},
			},
			ReasonCode.CTA_RESTRICTION
		)
	}

	const lastStayDate = params.stayDates[params.stayDates.length - 1]
	const lastStayDay = params.rowsByDate.get(lastStayDate)
	if (!lastStayDay) {
		return withReason(
			{
				...base,
				diagnostics: {
					missingCoverage: true,
				},
			},
			ReasonCode.MISSING_COVERAGE
		)
	}
	if (lastStayDay.ctd) {
		return withReason(
			{
				...base,
				availability: {
					hasInventory: true,
					hasRestrictions: true,
				},
			},
			ReasonCode.CTD_RESTRICTION
		)
	}

	const minStay = checkInDay.minStay == null ? 1 : Math.max(1, Number(checkInDay.minStay))
	if (params.stayDates.length < minStay) {
		return withReason(
			{
				...base,
				availability: {
					hasInventory: true,
					hasRestrictions: true,
				},
			},
			ReasonCode.MIN_STAY_NOT_MET
		)
	}

	const totalPrice = stayDays.reduce((sum, day) => sum + Number(day.pricePerNight ?? 0), 0)
	const hasCompletePricing = stayDays.every(
		(day) => day.pricePerNight != null && Number.isFinite(Number(day.pricePerNight))
	)
	const hasInventory = stayDays.every(
		(day) =>
			Boolean(day.hasAvailability) &&
			Math.max(0, Number(day.availableUnits ?? 0)) >= requestedRooms &&
			!Boolean(day.stopSell)
	)
	const hasRestrictions = stayDays.some(
		(day) => Boolean(day.cta) || Boolean(day.ctd) || Boolean(day.stopSell)
	)

	for (const day of stayDays) {
		const daySellable =
			Boolean(day.isSellable) &&
			Boolean(day.isAvailable) &&
			Boolean(day.hasAvailability) &&
			Boolean(day.hasPrice) &&
			!Boolean(day.stopSell) &&
			Math.max(0, Number(day.availableUnits ?? 0)) >= requestedRooms
		if (!daySellable) {
			const reason = mapPrimaryBlockerToReasonCode(day.primaryBlocker)
			return withReason(
				{
					...base,
					price: {
						base: hasCompletePricing ? { amount: totalPrice, currency: "USD" } : null,
						display: hasCompletePricing ? { amount: totalPrice, currency } : null,
					},
					availability: {
						hasInventory,
						hasRestrictions,
					},
					diagnostics: {
						missingCoverage: reason === ReasonCode.MISSING_COVERAGE,
						staleView: reason === ReasonCode.STALE_VIEW,
					},
				},
				reason
			)
		}
	}

	return {
		isSellable: true,
		reasonCodes: [],
		price: {
			base: hasCompletePricing ? { amount: totalPrice, currency: "USD" } : null,
			display: hasCompletePricing ? { amount: totalPrice, currency } : null,
		},
		availability: {
			hasInventory,
			hasRestrictions,
		},
		policies: {
			isCompliant: true,
		},
	}
}
