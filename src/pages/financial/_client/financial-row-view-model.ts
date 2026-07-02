import { labelFrom, ownerLabels, workItemLabels } from "./financial-labels"
import {
	duplicateReferenceDescription,
	reconciliationIssueDescription,
	reconciliationIssueLabel,
	unmatchedEvidenceDescription,
} from "./financial-reconciliation-copy"
import { buildProviderFinanceRowViewModel } from "./financial-provider-finance-view-model"

export type FinancialOperationalQueue =
	| "needs_review"
	| "reconciliation_issues"
	| "refund_handoffs"
	| "provider_finance"
	| "evidence_issues"
	| "waiting_external"
	| "resolved_history"
	| "advanced_all"

export type FinancialOperationalCategory =
	| "collections"
	| "provider_payables"
	| "refunds"
	| "settlements"
	| "exceptions"

export type FinancialAttentionState =
	| "needs_attention"
	| "waiting_external"
	| "blocked"
	| "ready_to_close"
	| "closed"

export type FinancialRowViewModel = {
	id: string
	queue: FinancialOperationalQueue
	operationalCategory: FinancialOperationalCategory
	attentionState: FinancialAttentionState
	title: string
	description: string
	bookingId: string
	providerId: string
	owner: string
	ownerLabel: string
	blocker: string
	staleState: string
	evidenceSummary: string
	nextAction: string
	severity: string
	ageLabel: string
	operationalState: string
	isBlocked: boolean
	canClose: boolean
	amount: number | null
	amountCurrency: string
	amountLabel: string
	sourceKind: string
	item: any
}

function exceptionCodes(item: any): string[] {
	return Array.isArray(item?.operation?.operationalException?.all)
		? item.operation.operationalException.all.map((entry: any) => String(entry?.code || ""))
		: []
}

function hasAnyCode(item: any, codes: string[]): boolean {
	return String(item?.code || "")
		? codes.includes(String(item.code))
		: exceptionCodes(item).some((code) => codes.includes(code))
}

function providerFinancePrimaryDetail(item: any): any | null {
	const details = Array.isArray(item?.providerFinance?.blockingDetails)
		? item.providerFinance.blockingDetails
		: []
	return details[0] || null
}

function hasReference(referenceCounts: any, key: string): boolean {
	return Number(referenceCounts?.[key] || 0) > 0
}

function missingEvidenceLabel(item: any, referenceCounts: any): string | null {
	const paymentMissing = hasAnyCode(item, ["missing_payment_reference"])
	const settlementMissing = hasAnyCode(item, ["missing_settlement_reference"])
	const refundMissing = hasAnyCode(item, ["missing_refund_reference"])
	if (paymentMissing && !hasReference(referenceCounts, "payment"))
		return "Falta el comprobante de cobro."
	if (settlementMissing && !hasReference(referenceCounts, "settlement"))
		return "Falta el comprobante externo."
	if (refundMissing && !hasReference(referenceCounts, "refund"))
		return "Falta el comprobante de reembolso."
	return null
}

function needsExternalAfterPayment(item: any, referenceCounts: any): boolean {
	return (
		hasAnyCode(item, ["missing_payment_reference"]) &&
		hasReference(referenceCounts, "payment") &&
		!hasReference(referenceCounts, "settlement")
	)
}

function primaryBlocker(item: any, reconciliation: any, referenceCounts: any): string {
	if (item?.providerFinance) return buildProviderFinanceRowViewModel(item.providerFinance).blocker
	const financeDetail = providerFinancePrimaryDetail(item)
	if (financeDetail?.reason) return financeDetail.reason
	if (hasAnyCode(item, ["refund_handoff_required"])) return "El reembolso necesita seguimiento."
	const missingEvidence = missingEvidenceLabel(item, referenceCounts)
	if (missingEvidence) return missingEvidence
	if (needsExternalAfterPayment(item, referenceCounts))
		return "Falta el comprobante externo para comparar importes."
	const reconciliationIssue = reconciliationIssueLabel(reconciliation)
	if (reconciliationIssue) return reconciliationIssue
	if (hasAnyCode(item, ["incomplete_contract_snapshot"]))
		return "Faltan datos confirmados de la reserva."
	if (item?.code === "clean_record") return "Este caso no tiene bloqueos visibles."
	return item?.reason || "Este caso necesita revisión de un operador."
}

function nextActionFor(item: any, reconciliation: any, referenceCounts: any): string {
	if (item?.providerFinance)
		return buildProviderFinanceRowViewModel(item.providerFinance).nextAction
	const financeDetail = providerFinancePrimaryDetail(item)
	if (financeDetail?.nextOperationalAction) return financeDetail.nextOperationalAction
	if (needsExternalAfterPayment(item, referenceCounts))
		return "Registra el comprobante externo faltante."
	if (missingEvidenceLabel(item, referenceCounts))
		return "Registra la referencia externa cuando esté disponible."
	if (reconciliation?.reviewState === "stale")
		return "Revisa los comprobantes nuevos y confirma la revisión."
	if (reconciliation && reconciliation.status !== "matched")
		return "Compara los importes visibles antes de cerrar el caso."
	if (hasAnyCode(item, ["refund_handoff_required"]))
		return "Revisa los comprobantes y el seguimiento del reembolso."
	if (item?.persistedId && !["resolved", "dismissed"].includes(String(item.status || "open")))
		return "Inicia la revisión, cierra el caso o descártalo con una nota."
	if (item?.code === "clean_record") return "No requiere acción."
	return "Abre el detalle y revisa el contexto."
}

function queueFor(item: any, reconciliation: any, referenceCounts: any): FinancialOperationalQueue {
	if (item?.evidenceIssue) return "evidence_issues"
	if (item?.providerFinance) return "provider_finance"
	if (hasAnyCode(item, ["refund_handoff_required"])) return "refund_handoffs"
	if (
		reconciliation &&
		(reconciliation.status !== "matched" ||
			reconciliation.reviewState === "stale" ||
			(Array.isArray(reconciliation.mismatchReasons) && reconciliation.mismatchReasons.length > 0))
	) {
		return "reconciliation_issues"
	}
	if (missingEvidenceLabel(item, referenceCounts) || hasAnyCode(item, ["evidence_unknown"]))
		return "evidence_issues"
	if (String(item?.status || "") === "waiting_external") return "waiting_external"
	if (["resolved", "dismissed"].includes(String(item?.status || ""))) return "resolved_history"
	if (item?.code === "clean_record") return "advanced_all"
	return "needs_review"
}

function operationalCategoryFor(
	item: any,
	reconciliation: any,
	referenceCounts: any
): FinancialOperationalCategory {
	const evidenceKind = String(item?.evidenceIssue?.kind || "")
	if (item?.providerFinance) return "provider_payables"
	if (
		hasAnyCode(item, ["refund_handoff_required", "missing_refund_reference"]) ||
		evidenceKind === "refund"
	) {
		return "refunds"
	}
	if (
		(reconciliation &&
			(reconciliation.status !== "matched" ||
				reconciliation.reviewState === "stale" ||
				reconciliation.mismatchReasons?.length)) ||
		hasAnyCode(item, ["missing_settlement_reference"]) ||
		["duplicate_reference", "unmatched_settlement"].includes(evidenceKind)
	) {
		return "settlements"
	}
	if (
		(hasAnyCode(item, ["missing_payment_reference"]) &&
			!hasReference(referenceCounts, "payment")) ||
		evidenceKind === "unmatched_payment"
	) {
		return "collections"
	}
	return "exceptions"
}

function operationalAmount(params: {
	item: any
	reconciliation: any
	refundHandoff?: any
	category: FinancialOperationalCategory
}): { amount: number | null; currency: string; label: string } {
	const { item, reconciliation, refundHandoff, category } = params
	const operation = item?.operation || {}
	const currency = String(
		item?.providerFinance?.currency ||
			refundHandoff?.currency ||
			reconciliation?.currency ||
			operation?.currency ||
			"USD"
	)
	if (category === "provider_payables") {
		return {
			amount: item?.providerFinance?.netPayable ?? null,
			currency,
			label: "Pendiente al proveedor",
		}
	}
	if (category === "refunds" && refundHandoff?.expectedAmount != null) {
		return {
			amount: Number(refundHandoff.expectedAmount),
			currency,
			label: "Reembolso esperado",
		}
	}
	if (category === "settlements" && reconciliation) {
		const difference = Number(reconciliation?.differenceAmount || 0)
		return {
			amount:
				difference !== 0
					? Math.abs(difference)
					: Number(reconciliation?.contractAmount ?? operation?.contractTotal ?? 0),
			currency,
			label: difference !== 0 ? "Diferencia por revisar" : "Importe revisado",
		}
	}
	const amount = operation?.contractTotal ?? item?.amount ?? null
	return {
		amount: amount == null ? null : Number(amount),
		currency,
		label: category === "collections" ? "Importe del cobro" : "Importe de la reserva",
	}
}

function operationalFlags(params: {
	item: any
	queue: FinancialOperationalQueue
	financeView: ReturnType<typeof buildProviderFinanceRowViewModel> | null
	reconciliation: any
	referenceCounts: any
}): {
	isBlocked: boolean
	canClose: boolean
	attentionState: FinancialAttentionState
} {
	const { item, queue, financeView, reconciliation, referenceCounts } = params
	const status = String(item?.status || "open")
	const isClosed = ["resolved", "dismissed"].includes(status) || queue === "resolved_history"
	const isWaiting = status === "waiting_external" || queue === "waiting_external"
	const hasSpecificEvidenceBlock =
		Boolean(missingEvidenceLabel(item, referenceCounts)) ||
		hasAnyCode(item, ["evidence_unknown", "refund_handoff_required"])
	const isBlocked =
		!isClosed &&
		!isWaiting &&
		(Boolean(item?.evidenceIssue) ||
			hasSpecificEvidenceBlock ||
			Boolean(
				reconciliation &&
				(reconciliation.status !== "matched" ||
					reconciliation.reviewState === "stale" ||
					reconciliation.mismatchReasons?.length)
			) ||
			Boolean(financeView && financeView.subqueue !== "provider_finance_review"))
	const canClose =
		!isClosed && !isWaiting && !isBlocked && Boolean(item?.persistedId) && status === "acknowledged"
	const attentionState: FinancialAttentionState = isClosed
		? "closed"
		: isWaiting
			? "waiting_external"
			: canClose
				? "ready_to_close"
				: isBlocked
					? "blocked"
					: "needs_attention"
	return { isBlocked, canClose, attentionState }
}

function evidenceSummaryFor(item: any, referenceCounts: any): string {
	if (item?.evidenceIssue?.kind === "duplicate_reference")
		return "La referencia aparece en más de una reserva"
	if (item?.evidenceIssue?.kind === "unmatched_payment") return "Cobro sin reserva asociada"
	if (item?.evidenceIssue?.kind === "unmatched_settlement")
		return "Liquidación sin reserva asociada"
	if (hasAnyCode(item, ["missing_payment_reference"]) && !hasReference(referenceCounts, "payment"))
		return "Falta comprobante de cobro"
	if (
		hasAnyCode(item, ["missing_settlement_reference"]) &&
		!hasReference(referenceCounts, "settlement")
	)
		return "Falta comprobante externo"
	if (hasAnyCode(item, ["missing_refund_reference"]) && !hasReference(referenceCounts, "refund"))
		return "Falta comprobante de reembolso"
	const total =
		Number(referenceCounts.payment || 0) +
		Number(referenceCounts.settlement || 0) +
		Number(referenceCounts.refund || 0) +
		Number(referenceCounts.invoice || 0)
	if (!total) return "Sin comprobantes externos registrados"
	if (total === 1) return "1 comprobante externo registrado"
	return `${total} comprobantes externos registrados`
}

function operationalDescriptionFor(item: any): string {
	if (hasAnyCode(item, ["missing_payment_reference"]))
		return "El cobro necesita una referencia externa para poder revisarse."
	if (hasAnyCode(item, ["missing_settlement_reference"]))
		return "La reserva todavía no tiene una liquidación externa asociada."
	if (hasAnyCode(item, ["missing_refund_reference"]))
		return "El seguimiento del reembolso todavía no tiene un comprobante asociado."
	if (hasAnyCode(item, ["refund_handoff_required"]))
		return "El reembolso necesita seguimiento y una decisión operativa."
	if (hasAnyCode(item, ["incomplete_contract_snapshot"]))
		return "Faltan datos confirmados de la reserva para completar la revisión."
	if (hasAnyCode(item, ["evidence_unknown"]))
		return "Los comprobantes disponibles no permiten confirmar qué ocurrió."
	if (item?.code === "clean_record")
		return "No hay excepciones abiertas ni acciones pendientes para esta reserva."
	return "Revisa la información disponible y decide el siguiente paso."
}

function titleFor(params: {
	item: any
	evidenceIssue: any
	financeView: ReturnType<typeof buildProviderFinanceRowViewModel> | null
	reconciliation: any
	referenceCounts: any
}): string {
	const { item, evidenceIssue, financeView, reconciliation, referenceCounts } = params
	if (evidenceIssue) return evidenceIssue.title
	if (financeView) return financeView.title
	if (hasAnyCode(item, ["missing_payment_reference"]) && hasReference(referenceCounts, "payment")) {
		if (needsExternalAfterPayment(item, referenceCounts)) return "Falta comprobante externo"
		if (reconciliation && reconciliation.status !== "matched") return "Importes por revisar"
		return "Comprobante de cobro registrado"
	}
	if (item?.code) return labelFrom(workItemLabels, item.code)
	return "Caso por revisar"
}

function descriptionFor(params: {
	item: any
	evidenceIssue: any
	financeView: ReturnType<typeof buildProviderFinanceRowViewModel> | null
	reconciliation: any
	referenceCounts: any
}): string {
	const { item, evidenceIssue, financeView, reconciliation, referenceCounts } = params
	if (evidenceIssue) return evidenceIssue.description
	if (financeView) return financeView.blocker
	if (hasAnyCode(item, ["missing_payment_reference"]) && hasReference(referenceCounts, "payment")) {
		if (needsExternalAfterPayment(item, referenceCounts))
			return "El comprobante de cobro ya está registrado; falta el comprobante externo para completar la comparación."
		return "El comprobante de cobro está registrado. Revisa los importes antes de cerrar el caso."
	}
	if (reconciliation && reconciliation.status !== "matched")
		return reconciliationIssueDescription(reconciliation)
	return operationalDescriptionFor(item)
}

export function buildFinancialRowViewModel(params: {
	item: any
	reconciliation: any
	refundHandoff?: any
	referenceCounts: any
	ageLabel: string
	sourceKind: string
}): FinancialRowViewModel {
	const { item, reconciliation, referenceCounts } = params
	const evidenceIssue = item?.evidenceIssue
	const financeView = item?.providerFinance
		? buildProviderFinanceRowViewModel(item.providerFinance)
		: null
	const financeDetail = providerFinancePrimaryDetail(item)
	const title = titleFor({ item, evidenceIssue, financeView, reconciliation, referenceCounts })
	const description = descriptionFor({
		item,
		evidenceIssue,
		financeView,
		reconciliation,
		referenceCounts,
	})
	const owner = String(
		evidenceIssue?.owner ||
			financeView?.owner ||
			financeDetail?.owner ||
			item?.nextOwner ||
			"financial_operations"
	)
	const queue = queueFor(item, reconciliation, referenceCounts)
	const operationalCategory = operationalCategoryFor(item, reconciliation, referenceCounts)
	const amount = operationalAmount({
		item,
		reconciliation,
		refundHandoff: params.refundHandoff,
		category: operationalCategory,
	})
	const flags = operationalFlags({ item, queue, financeView, reconciliation, referenceCounts })
	return {
		id: String(item?.id || `${item?.bookingId || ""}:${item?.code || "review"}`),
		queue,
		operationalCategory,
		attentionState: flags.attentionState,
		title,
		description,
		bookingId: String(item?.bookingId || ""),
		providerId: String(item?.providerId || ""),
		owner,
		ownerLabel: labelFrom(ownerLabels, owner),
		blocker: evidenceIssue?.blocker || primaryBlocker(item, reconciliation, referenceCounts),
		staleState: String(
			financeView?.freshness ||
				item?.providerFinance?.snapshotLifecycle?.freshness ||
				reconciliation?.reviewState ||
				item?.operation?.evidenceAlignment?.state ||
				"fresh"
		),
		evidenceSummary: evidenceSummaryFor(item, referenceCounts),
		nextAction: evidenceIssue?.nextAction || nextActionFor(item, reconciliation, referenceCounts),
		severity: String(
			financeView?.severity || item?.severity || evidenceIssue?.severity || "review"
		),
		ageLabel: params.ageLabel,
		operationalState: String(
			financeView?.operationalState || item?.status || reconciliation?.status || "open"
		),
		isBlocked: flags.isBlocked,
		canClose: flags.canClose,
		amount: amount.amount,
		amountCurrency: amount.currency,
		amountLabel: amount.label,
		sourceKind: params.sourceKind,
		item,
	}
}

export function buildDuplicateReferenceWorkItem(signal: any): any {
	const externalReference = String(signal?.externalReference || "unknown_reference")
	const bookingIds = Array.isArray(signal?.bookingIds) ? signal.bookingIds : []
	return {
		id: `evidence-duplicate:${externalReference}`,
		bookingId: String(bookingIds[0] || ""),
		providerId: String(signal?.providerId || ""),
		code: "duplicate_external_reference",
		status: "open",
		nextOwner: "financial_operations",
		overlaySource: "visibility_only",
		evidenceIssue: {
			kind: "duplicate_reference",
			title: "Referencia externa duplicada",
			description: duplicateReferenceDescription(signal),
			blocker: "La misma referencia externa aparece en más de una reserva.",
			nextAction: "Confirma a qué reserva corresponde antes de cerrar el caso.",
			owner: "reconciliation_ops",
			severity: "review",
		},
	}
}

export function buildUnmatchedEvidenceWorkItem(kind: "payment" | "settlement", row: any): any {
	const reference =
		kind === "payment"
			? String(row?.externalReference || row?.id || "payment")
			: String(row?.settlementReference || row?.id || "settlement")
	const rawBookingId = String(row?.bookingId || "")
	const bookingId = rawBookingId.startsWith("unmatched:") ? "" : rawBookingId
	return {
		id: `evidence-unmatched:${kind}:${reference}`,
		bookingId,
		providerId: String(row?.providerId || ""),
		code: kind === "payment" ? "unmatched_payment_transaction" : "unmatched_settlement_record",
		status: "open",
		nextOwner: "financial_operations",
		overlaySource: "visibility_only",
		evidenceIssue: {
			kind: kind === "payment" ? "unmatched_payment" : "unmatched_settlement",
			title: kind === "payment" ? "Cobro sin reserva asociada" : "Liquidación sin reserva asociada",
			description: unmatchedEvidenceDescription(kind, row),
			blocker: "El comprobante está visible, pero todavía no está asociado a una reserva.",
			nextAction: "Identifica la reserva correspondiente antes de cerrar el caso.",
			owner: "reconciliation_ops",
			severity: "review",
		},
	}
}
