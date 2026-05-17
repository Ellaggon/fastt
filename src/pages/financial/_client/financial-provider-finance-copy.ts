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

export function explainProviderFinanceBlocker(finance: any): string {
	const details = Array.isArray(finance?.blockingDetails) ? finance.blockingDetails : []
	const primary = details[0]
	if (primary?.reason) return String(primary.reason)
	if (finance?.reconciliation?.readyForPayable === false) {
		return "Provider finance visibility is blocked until reconciliation evidence is reviewed."
	}
	if (finance?.statement?.state && String(finance.statement.state) !== "fresh") {
		return "Statement draft visibility needs review before provider finance can continue."
	}
	return "No provider finance blocker is visible."
}

export function explainProviderFinanceNextAction(finance: any): string {
	const details = Array.isArray(finance?.blockingDetails) ? finance.blockingDetails : []
	const primary = details[0]
	if (primary?.nextOperationalAction) return String(primary.nextOperationalAction)
	if (finance?.nextOperationalAction) return String(finance.nextOperationalAction)
	if (finance?.reconciliation?.readyForPayable === false) {
		return "Review reconciliation evidence before continuing payable visibility."
	}
	return "Monitor provider finance visibility."
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
		statementFreshness: labelFrom({}, finance?.statement?.state || "unknown"),
		reconciliationDependency: finance?.reconciliation?.readyForPayable
			? "Ready for payable visibility"
			: labelFrom(reconciliationStatusLabels, blockingStatus),
		nextAction: explainProviderFinanceNextAction(finance),
		freshnessNote,
	}
}

export function providerFinanceBlockerLabel(detail: any): string {
	return labelFrom(providerFinanceQueueLabels, detail?.code)
}
