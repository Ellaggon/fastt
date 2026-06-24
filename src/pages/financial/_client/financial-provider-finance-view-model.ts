import { labelFrom, providerFinanceQueueLabels } from "./financial-labels"
import {
	explainProviderFinanceBlocker,
	explainProviderFinanceNextAction,
} from "./financial-provider-finance-copy"

export type ProviderFinanceOperationalQueue =
	| "payable_blocked"
	| "statement_stale"
	| "reconciliation_blocked"
	| "commission_missing"
	| "reference_missing"
	| "provider_finance_review"

export type ProviderFinanceRowViewModel = {
	title: string
	blocker: string
	freshness: string
	nextAction: string
	operationalState: string
	statementState: string
	severity: string
	owner: string
	subqueue: ProviderFinanceOperationalQueue
}

function blockingCodes(finance: any): string[] {
	return Array.isArray(finance?.blockingDetails)
		? finance.blockingDetails.map((detail: any) => String(detail?.code || ""))
		: []
}

export function deriveProviderFinanceSubqueue(finance: any): ProviderFinanceOperationalQueue {
	const codes = blockingCodes(finance)
	const statementState = String(finance?.statement?.state || finance?.statement?.freshness || "")
	if (codes.some((code) => code.includes("commission"))) return "commission_missing"
	if (codes.some((code) => code.includes("reference"))) return "reference_missing"
	if (finance?.reconciliation?.readyForPayable === false) return "reconciliation_blocked"
	if (statementState && statementState !== "fresh") return "statement_stale"
	if (codes.length) return "payable_blocked"
	return "provider_finance_review"
}

export function buildProviderFinanceRowViewModel(finance: any): ProviderFinanceRowViewModel {
	const subqueue = deriveProviderFinanceSubqueue(finance)
	const statementState = String(
		finance?.statement?.state || finance?.statement?.freshness || "unknown"
	)
	const owner = String(finance?.operationalOwner || finance?.nextOwner || "provider_finance")
	const blocker = explainProviderFinanceBlocker(finance)
	return {
		title: labelFrom(providerFinanceQueueLabels, subqueue, "Pago pendiente al proveedor"),
		blocker,
		freshness: String(finance?.snapshotLifecycle?.freshness || statementState || "unknown"),
		nextAction: explainProviderFinanceNextAction(finance),
		operationalState: subqueue,
		statementState,
		severity: subqueue === "provider_finance_review" ? "review" : "blocked",
		owner,
		subqueue,
	}
}
