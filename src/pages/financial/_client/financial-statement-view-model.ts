import { humanize } from "./financial-labels"

export type FinancialStatementViewModel = {
	visible: boolean
	title: string
	state: string
	freshness: string
	includedBookings: number
	excludedBookings: number
	staleReasons: string[]
	dependencies: string[]
	nextAction: string
}

export function buildFinancialStatementViewModel(finance: any): FinancialStatementViewModel {
	const statement = finance?.statement || {}
	const staleReasons = Array.isArray(statement?.staleReasons)
		? statement.staleReasons.map((reason: unknown) => humanize(reason))
		: []
	const dependencies = [
		finance?.reconciliation?.readyForPayable
			? "Reconciliation evidence reviewed"
			: "Reconciliation review needed",
		statement?.state === "fresh" ? "Statement draft fresh" : "Statement draft needs review",
	].filter(Boolean)
	return {
		visible: Boolean(finance),
		title: "Provider statement visibility",
		state: humanize(statement?.state || "unknown"),
		freshness: humanize(statement?.freshness || statement?.state || "unknown"),
		includedBookings: Number(statement?.includedBookings || statement?.includedBookingCount || 0),
		excludedBookings: Number(statement?.excludedBookings || statement?.excludedBookingCount || 0),
		staleReasons,
		dependencies,
		nextAction:
			statement?.nextOperationalAction ||
			finance?.nextOperationalAction ||
			"Review statement freshness before provider finance continues.",
	}
}
