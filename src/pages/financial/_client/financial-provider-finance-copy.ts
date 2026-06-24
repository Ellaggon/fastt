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

const providerFinanceReasonByCode: Record<string, string> = {
	provider_profile_incomplete:
		"Faltan datos financieros del proveedor para continuar con la revisión.",
	commission_snapshot_missing:
		"Falta la comisión acordada o dejó de coincidir con las condiciones de la reserva.",
	provider_finance_dispute: "Los importes todavía requieren revisión.",
	provider_statement_pending: "El resumen del proveedor falta o quedó desactualizado.",
	payout_reference_missing: "Todavía no se registró la referencia financiera externa.",
	payout_blocked: "Hay requisitos operativos pendientes antes de continuar.",
	payable_blocked: "Hay requisitos operativos pendientes antes de continuar.",
	reconciliation_blocked: "Los importes todavía requieren revisión.",
	commission_missing:
		"Falta la comisión acordada o dejó de coincidir con las condiciones de la reserva.",
	statement_stale: "El resumen del proveedor quedó desactualizado.",
	reference_missing: "Todavía no se registró la referencia financiera externa.",
}

const providerFinanceActionByCode: Record<string, string> = {
	provider_profile_incomplete: "Completa o confirma los datos financieros del proveedor.",
	commission_snapshot_missing: "Confirma la comisión acordada para esta reserva.",
	provider_finance_dispute: "Revisa los importes y comprobantes visibles.",
	provider_statement_pending: "Revisa los totales del resumen con la información más reciente.",
	payout_reference_missing: "Registra la referencia externa cuando esté disponible.",
	payout_blocked: "Resuelve primero el requisito operativo indicado.",
	payable_blocked: "Resuelve primero el requisito operativo indicado.",
	reconciliation_blocked: "Revisa los importes y comprobantes visibles.",
	commission_missing: "Confirma la comisión acordada para esta reserva.",
	statement_stale: "Revisa el resumen con la información más reciente.",
	reference_missing: "Registra la referencia externa cuando esté disponible.",
}

function humanFreshness(value: unknown): string {
	const state = String(value || "").toLowerCase()
	if (state === "fresh") return "Actualizado"
	if (state === "stale") return "Requiere otra revisión"
	if (state === "unknown") return "Por confirmar"
	if (state === "pending") return "Pendiente de revisión"
	if (state === "missing") return "Información faltante"
	return "Por confirmar"
}

export function explainProviderFinanceBlocker(finance: any): string {
	const details = Array.isArray(finance?.blockingDetails) ? finance.blockingDetails : []
	const primary = details[0]
	if (primary?.code && providerFinanceReasonByCode[String(primary.code)])
		return providerFinanceReasonByCode[String(primary.code)]
	if (finance?.reconciliation?.readyForPayable === false) {
		return "El pago pendiente no puede continuar hasta revisar los comprobantes."
	}
	if (finance?.statement?.state && String(finance.statement.state) !== "fresh") {
		return "El resumen del proveedor debe revisarse antes de continuar."
	}
	return "No hay bloqueos visibles para este pago pendiente."
}

export function explainProviderFinanceNextAction(finance: any): string {
	const details = Array.isArray(finance?.blockingDetails) ? finance.blockingDetails : []
	const primary = details[0]
	if (primary?.code && providerFinanceActionByCode[String(primary.code)])
		return providerFinanceActionByCode[String(primary.code)]
	if (finance?.reconciliation?.readyForPayable === false) {
		return "Revisa la diferencia de importes antes de continuar."
	}
	return "Mantén este pago pendiente visible hasta completar la revisión."
}

export function buildProviderFinanceCopy(finance: any): ProviderFinanceCopy {
	const staleReasons = Array.isArray(finance?.snapshotLifecycle?.staleReasons)
		? finance.snapshotLifecycle.staleReasons
		: []
	const freshnessNote = staleReasons
		.map((reason: string) => labelFrom(staleReasonLabels, reason))
		.join(", ")
	const blockingStatus = String(
		finance?.reconciliation?.blockingStatus || "missing_reconciliation_match"
	)
	return {
		blocker: explainProviderFinanceBlocker(finance),
		statementFreshness: humanFreshness(finance?.statement?.state || "unknown"),
		reconciliationDependency: finance?.reconciliation?.readyForPayable
			? "Los importes ya fueron revisados"
			: reconciliationStatusLabels[blockingStatus] || "Los importes todavía requieren revisión",
		nextAction: explainProviderFinanceNextAction(finance),
		freshnessNote,
	}
}

export function providerFinanceBlockerLabel(detail: any): string {
	return labelFrom(providerFinanceQueueLabels, detail?.code)
}

export function providerFinanceBlockerReason(detail: any): string {
	return (
		providerFinanceReasonByCode[String(detail?.code || "")] ||
		"Este pago pendiente requiere una revisión operativa."
	)
}

export function providerFinanceBlockerAction(detail: any): string {
	return (
		providerFinanceActionByCode[String(detail?.code || "")] ||
		"Revisa el caso y confirma el siguiente paso."
	)
}
