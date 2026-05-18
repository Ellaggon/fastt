import { labelFrom, mismatchReasonLabels, reconciliationStatusLabels } from "./financial-labels"
import { reconciliationIssueDescription } from "./financial-reconciliation-copy"

export type FinancialReconciliationViewModel = {
	visible: boolean
	statusLabel: string
	explanation: string
	contractAmount: number | null
	paymentAmount: number | null
	settlementAmount: number | null
	differenceAmount: number | null
	currency: string
	reasons: string[]
	reviewState: string
	reviewStatus: string
	providerFinanceBlocker: string
}

export function buildReconciliationViewModel(match: any): FinancialReconciliationViewModel {
	if (!match) {
		return {
			visible: false,
			statusLabel: "Not visible",
			explanation: "No proof comparison is visible for this booking yet.",
			contractAmount: null,
			paymentAmount: null,
			settlementAmount: null,
			differenceAmount: null,
			currency: "USD",
			reasons: [],
			reviewState: "unknown",
			reviewStatus: "unreviewed",
			providerFinanceBlocker:
				"Provider payable checks may stay stuck until comparison proof is visible.",
		}
	}
	const reasons = Array.isArray(match.mismatchReasons)
		? match.mismatchReasons.map((reason: string) => labelFrom(mismatchReasonLabels, reason))
		: []
	return {
		visible: true,
		statusLabel: labelFrom(reconciliationStatusLabels, match.status),
		explanation: reconciliationIssueDescription(match),
		contractAmount: match.contractAmount ?? null,
		paymentAmount: match.paymentAmount ?? null,
		settlementAmount: match.settlementAmount ?? null,
		differenceAmount: match.differenceAmount ?? null,
		currency: String(match.currency || "USD"),
		reasons,
		reviewState: String(match.reviewState || "fresh"),
		reviewStatus: String(match.reviewStatus || "unreviewed"),
		providerFinanceBlocker:
			match.status === "matched" && match.reviewState !== "stale"
				? "Provider payable checks can continue when the remaining inputs are ready."
				: "Provider payable checks stay stuck until this proof comparison is reviewed.",
	}
}
