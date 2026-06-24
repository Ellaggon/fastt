import type { FinancialRowViewModel } from "./financial-row-view-model"
import { buildEvidenceGroups } from "./financial-evidence-view-model"
import { buildProviderFinanceCopy } from "./financial-provider-finance-copy"
import { buildReconciliationViewModel } from "./financial-reconciliation-view-model"
import { buildFinancialStatementViewModel } from "./financial-statement-view-model"

export type FinancialDrawerSectionId =
	| "attention"
	| "why"
	| "context"
	| "evidence"
	| "reconciliation"
	| "refund"
	| "provider_finance"
	| "statement"
	| "timeline"
	| "actions"
	| "technical"

export type FinancialDrawerViewModel = {
	row: FinancialRowViewModel
	item: any
	operation: any
	reconciliation: ReturnType<typeof buildReconciliationViewModel>
	reconciliationMatch: any
	providerFinance: ReturnType<typeof buildProviderFinanceCopy> | null
	statement: ReturnType<typeof buildFinancialStatementViewModel>
	evidenceGroups: ReturnType<typeof buildEvidenceGroups>
	evidenceEntries: any[]
	duplicateSignals: any[]
	sections: FinancialDrawerSectionId[]
	whyThisNeedsReview: string
	technicalDetails: string[]
}

export function buildFinancialDrawerViewModel(params: {
	row: FinancialRowViewModel
	reconciliationMatch: any
	evidenceEntries: any[]
	duplicateSignals: any[]
}): FinancialDrawerViewModel {
	const { row, reconciliationMatch, evidenceEntries, duplicateSignals } = params
	const item = row.item
	const operation = item?.operation || {}
	const reconciliation = buildReconciliationViewModel(reconciliationMatch)
	const providerFinance = item?.providerFinance
		? buildProviderFinanceCopy(item.providerFinance)
		: null
	const statement = buildFinancialStatementViewModel(item?.providerFinance)
	const allEvidenceGroups = buildEvidenceGroups(evidenceEntries, duplicateSignals)
	const evidenceKeysByCategory: Record<string, string[]> = {
		collections: ["payment", "reference"],
		settlements: ["payment", "settlement", "reference"],
		refunds: ["refund", "reference"],
		provider_payables: ["payment", "settlement", "reference"],
		exceptions: ["reference"],
	}
	const allowedEvidenceKeys = evidenceKeysByCategory[row.operationalCategory] || ["reference"]
	const evidenceGroups = allEvidenceGroups.filter((group) =>
		allowedEvidenceKeys.includes(group.key)
	)
	const sections: FinancialDrawerSectionId[] = ["attention", "why", "context"]
	const shouldShowEvidence =
		evidenceEntries.length > 0 ||
		duplicateSignals.length > 0 ||
		["collections", "settlements", "refunds"].includes(row.operationalCategory)
	const shouldShowReconciliation =
		reconciliation.visible || ["settlements", "provider_payables"].includes(row.operationalCategory)
	if (shouldShowEvidence) sections.push("evidence")
	if (shouldShowReconciliation) sections.push("reconciliation")
	if (row.operationalCategory === "refunds") sections.push("refund")
	if (row.operationalCategory === "provider_payables") {
		sections.push("provider_finance", "statement")
	}
	sections.push("timeline", "actions", "technical")
	const whyParts = [
		row.description,
		row.blocker && row.blocker !== row.description ? row.blocker : "",
		providerFinance?.blocker && providerFinance.blocker !== row.blocker
			? providerFinance.blocker
			: "",
	].filter(Boolean)
	return {
		row,
		item,
		operation,
		reconciliation,
		reconciliationMatch,
		providerFinance,
		statement,
		evidenceGroups,
		evidenceEntries,
		duplicateSignals,
		sections,
		whyThisNeedsReview:
			whyParts.join(" ") ||
			"Revisa los comprobantes visibles y decide el siguiente paso operativo.",
		technicalDetails: [
			item?.basis ? `Basis: ${item.basis}` : "",
			item?.overlaySource ? `Source: ${item.overlaySource}` : "",
			operation?.evidenceAlignment?.state
				? `Evidence alignment: ${operation.evidenceAlignment.state}`
				: "",
			item?.providerFinance?.snapshotLifecycle?.fingerprint
				? `Provider finance fingerprint: ${item.providerFinance.snapshotLifecycle.fingerprint}`
				: "",
		].filter(Boolean),
	}
}
