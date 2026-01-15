export type StopSellParams = {}

export type MinLosParams = {
	nights: number
}

export type BookingWindowParams = {
	minDays?: number
	maxDays?: number
}

export type OperationalRuleParamsMap = {
	stop_sell: StopSellParams
	min_los: MinLosParams
	booking_window: BookingWindowParams
}
