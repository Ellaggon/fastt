import {
	labelFrom,
	providerFinanceQueueLabels,
	reconciliationStatusLabels,
	staleReasonLabels,
} from "./financial-labels"

export type ProviderFinanceCopy = {
	blocker: string
	statementFreshness: string
	reconciliationDependency: string
	nextAction: string
	freshnessNote: string
}

function humanFreshness(value: unknown): string {
	const state = String(value || "").toLowerCase()
	if (state === "fresh") return "Up to date"
	if (state === "stale") return "Needs another look"
	if (state === "unknown") return "Unclear"
	return state ? state.replaceAll("_", " ") : "Unclear"
}

export function explainProviderFinanceBlocker(finance: any): string {
	const details = Array.isArray(finance?.blockingDetails) ? finance.blockingDetails : []
	const primary = details[0]
	if (primary?.reason) return String(primary.reason)
	if (finance?.reconciliation?.readyForPayable === false) {
		return "Provider payable checks cannot continue until the proof has been reviewed."
	}
	if (finance?.statement?.state && String(finance.statement.state) !== "fresh") {
		return "The provider statement draft needs another look before this can continue."
	}
	return "Nothing is stopping the provider payable check."
}

export function explainProviderFinanceNextAction(finance: any): string {
	const details = Array.isArray(finance?.blockingDetails) ? finance.blockingDetails : []
	const primary = details[0]
	if (primary?.nextOperationalAction) return String(primary.nextOperationalAction)
	if (finance?.nextOperationalAction) return String(finance.nextOperationalAction)
	if (finance?.reconciliation?.readyForPayable === false) {
		return "Review the proof comparison before continuing this provider check."
	}
	return "Keep this provider check visible for review."
}

export function buildProviderFinanceCopy(finance: any): ProviderFinanceCopy {
	const staleReasons = Array.isArray(finance?.snapshotLifecycle?.staleReasons)
		? finance.snapshotLifecycle.staleReasons
		: []
	const freshnessNote = staleReasons
		.map((reason: string) => labelFrom(staleReasonLabels, reason))
		.join(", ")
	const blockingStatus = finance?.reconciliation?.blockingStatus || "missing_reconciliation_match"
	return {
		blocker: explainProviderFinanceBlocker(finance),
		statementFreshness: humanFreshness(finance?.statement?.state || "unknown"),
		reconciliationDependency: finance?.reconciliation?.readyForPayable
			? "Proof has been reviewed"
			: labelFrom(reconciliationStatusLabels, blockingStatus),
		nextAction: explainProviderFinanceNextAction(finance),
		freshnessNote,
	}
}

export function providerFinanceBlockerLabel(detail: any): string {
	return labelFrom(providerFinanceQueueLabels, detail?.code)
}
