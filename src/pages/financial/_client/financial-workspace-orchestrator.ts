import {
	buildDuplicateReferenceWorkItem,
	buildUnmatchedEvidenceWorkItem,
} from "./financial-row-view-model"
import type { FinancialWorkspaceState } from "./financial-workspace-state"
import { handoffTerminal, itemKey } from "./financial-workspace-selectors"

function operationFallbackForProviderFinance(financeItem: any): any {
	return {
		bookingId: financeItem.bookingId,
		providerId: financeItem.providerId,
		currency: financeItem.currency,
		contractTotal: financeItem.grossAmount,
		contract: {
			productName: "Pago pendiente al proveedor",
			variantName: "Importe para revisión",
			version: "snapshot",
		},
		evidenceAlignment: { state: "snapshot_ready" },
		taxFeeVisibility: { lines: 0 },
		snapshotIntegrity: {
			hasRoomSnapshots: true,
			hasTaxFeeSnapshots: true,
			multiRoomAllocationCount: financeItem?.contract?.roomSnapshotCount || 0,
		},
		transactions: { financialEvidence: {}, references: {} },
		refund: { state: "not_applicable" },
	}
}

function evidenceIssueOperation(params: {
	issue: any
	currency?: unknown
	contractTotal?: unknown
	variantName: string
	financialEvidence?: any
}): any {
	return {
		bookingId: params.issue.bookingId,
		providerId: params.issue.providerId,
		currency: params.currency || "",
		contractTotal: params.contractTotal ?? null,
		contract: { productName: "Comprobante por revisar", variantName: params.variantName },
		evidenceAlignment: { state: "evidence_partial" },
		snapshotIntegrity: { hasRoomSnapshots: true, hasTaxFeeSnapshots: true },
		taxFeeVisibility: { lines: 0 },
		transactions: { financialEvidence: params.financialEvidence || {}, references: {} },
		refund: { state: "not_applicable" },
	}
}

export function mergeFinancialWorkspaceItems(state: FinancialWorkspaceState): any[] {
	const operationByBooking = new Map(
		state.operationsItems.map((item) => [String(item.bookingId), item])
	)
	const merged = state.workflowItems.map((workflow) => ({
		...workflow,
		workflow,
		operation: operationByBooking.get(String(workflow.bookingId)) || null,
	}))
	const workflowKeys = new Set(merged.map(itemKey))

	for (const operation of state.operationsItems) {
		const exceptions = operation?.operationalException?.all || []
		if (exceptions.length) {
			for (const issue of exceptions) {
				const closedRefundHandoff = state.persistedRefundHandoffs.some(
					(handoff) => handoff.bookingId === issue.bookingId && handoffTerminal(handoff)
				)
				if (issue.code === "refund_handoff_required" && closedRefundHandoff) continue
				const candidate = {
					...issue,
					id: `operation:${issue.bookingId}:${issue.code}`,
					status: "open",
					overlaySource: "derived_only",
					persistedId: null,
					openedAt: null,
					operation,
					workflow: null,
				}
				if (!workflowKeys.has(itemKey(candidate))) merged.push(candidate)
			}
			continue
		}
		merged.push({
			id: `clean:${operation.bookingId}`,
			bookingId: operation.bookingId,
			providerId: operation?.providerId || "",
			code: "clean_record",
			severity: "review",
			status: "open",
			basis: "contract_snapshot",
			reason: "Los comprobantes visibles no presentan excepciones abiertas.",
			nextOwner: "none",
			overlaySource: "visibility_only",
			persistedId: null,
			openedAt: null,
			operation,
			workflow: null,
		})
	}

	for (const financeItem of state.providerFinanceItems) {
		if (!Array.isArray(financeItem?.queues) || !financeItem.queues.length) continue
		merged.push({
			id: `provider-finance:${financeItem.bookingId}`,
			bookingId: financeItem.bookingId,
			providerId: financeItem.providerId,
			code: "provider_finance_review",
			severity: "review",
			status: "open",
			basis: "provider_finance_snapshot_visibility",
			reason:
				(financeItem.blockingDetails || [])
					.map((detail: any) => detail.reason)
					.filter(Boolean)
					.join(" ") || "El pago pendiente al proveedor necesita revisión.",
			nextOwner: financeItem.operationalOwner || "provider_finance",
			overlaySource: "visibility_only",
			persistedId: null,
			openedAt: null,
			operation:
				operationByBooking.get(String(financeItem.bookingId)) ||
				operationFallbackForProviderFinance(financeItem),
			workflow: null,
			providerFinance: financeItem,
		})
	}

	for (const signal of state.duplicateExternalReferences) {
		const issue = buildDuplicateReferenceWorkItem(signal)
		issue.operation =
			operationByBooking.get(String(issue.bookingId)) ||
			evidenceIssueOperation({ issue, variantName: "Referencia duplicada" })
		merged.push(issue)
	}

	for (const row of state.unmatchedFinancialEvidence?.paymentTransactions || []) {
		const issue = buildUnmatchedEvidenceWorkItem("payment", row)
		issue.operation = evidenceIssueOperation({
			issue,
			currency: row.currency,
			contractTotal: row.amount,
			variantName: "Cobro sin reserva asociada",
			financialEvidence: { paymentEvidence: "evidence_visible" },
		})
		merged.push(issue)
	}

	for (const row of state.unmatchedFinancialEvidence?.settlementRecords || []) {
		const issue = buildUnmatchedEvidenceWorkItem("settlement", row)
		issue.operation = evidenceIssueOperation({
			issue,
			currency: row.currency,
			contractTotal: row.amount,
			variantName: "Liquidación sin reserva asociada",
			financialEvidence: { paymentEvidence: "evidence_visible" },
		})
		merged.push(issue)
	}

	state.combinedItems = merged
	return merged
}
