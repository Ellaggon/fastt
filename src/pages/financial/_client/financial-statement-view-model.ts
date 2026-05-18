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

function humanFreshness(value: unknown): string {
	const state = String(value || "").toLowerCase()
	if (state === "fresh") return "Up to date"
	if (state === "stale") return "Needs another look"
	if (state === "unknown") return "Unclear"
	return humanize(value)
}

export function buildFinancialStatementViewModel(finance: any): FinancialStatementViewModel {
	const statement = finance?.statement || {}
	const staleReasons = Array.isArray(statement?.staleReasons)
		? statement.staleReasons.map((reason: unknown) => humanize(reason))
		: []
	const dependencies = [
		finance?.reconciliation?.readyForPayable
			? "Proof comparison reviewed"
			: "Proof comparison still needs review",
		statement?.state === "fresh"
			? "Statement draft is up to date"
			: "Statement draft needs another look",
	].filter(Boolean)
	return {
		visible: Boolean(finance),
		title: "Provider statement draft",
		state: humanize(statement?.state || "unknown"),
		freshness: humanFreshness(statement?.freshness || statement?.state || "unknown"),
		includedBookings: Number(statement?.includedBookings || statement?.includedBookingCount || 0),
		excludedBookings: Number(statement?.excludedBookings || statement?.excludedBookingCount || 0),
		staleReasons,
		dependencies,
		nextAction:
			statement?.nextOperationalAction ||
			finance?.nextOperationalAction ||
			"Review whether the statement draft still matches the latest case information.",
	}
}
