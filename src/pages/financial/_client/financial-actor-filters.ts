import type { FinancialRowViewModel } from "./financial-row-view-model"

export type FinancialActorFilter =
	| "all"
	| "financial_operations"
	| "reconciliation_ops"
	| "provider_finance"
	| "provider_followup"
	| "support"
	| "admin"

export const actorFilterOptions: Array<{ value: FinancialActorFilter; label: string }> = [
	{ value: "all", label: "Todos los responsables" },
	{ value: "financial_operations", label: "Operación financiera" },
	{ value: "reconciliation_ops", label: "Equipo de liquidación" },
	{ value: "provider_finance", label: "Equipo de pagos" },
	{ value: "provider_followup", label: "Seguimiento con proveedores" },
	{ value: "support", label: "Soporte" },
	{ value: "admin", label: "Revisión administrativa" },
]

function issueKind(row: FinancialRowViewModel): string {
	return String(row.item?.evidenceIssue?.kind || "")
}

function isReconciliationEvidenceIssue(row: FinancialRowViewModel): boolean {
	return ["duplicate_reference", "unmatched_payment", "unmatched_settlement"].includes(
		issueKind(row)
	)
}

export function actorMatchesRow(actor: FinancialActorFilter, row: FinancialRowViewModel): boolean {
	if (actor === "all") return true
	if (actor === "financial_operations") {
		return (
			["needs_review", "waiting_external"].includes(row.queue) ||
			(row.queue === "evidence_issues" && !isReconciliationEvidenceIssue(row))
		)
	}
	if (actor === "reconciliation_ops") {
		return row.queue === "reconciliation_issues" || isReconciliationEvidenceIssue(row)
	}
	if (actor === "provider_finance") {
		return row.queue === "provider_finance" || row.owner === "provider_finance"
	}
	if (actor === "provider_followup") {
		return row.owner === "provider_followup" || row.owner === "external_finance"
	}
	if (actor === "support") {
		return (
			row.queue === "refund_handoffs" ||
			row.owner === "support" ||
			row.owner === "reservations" ||
			row.staleState === "waiting_external"
		)
	}
	if (actor === "admin") {
		return (
			row.queue === "advanced_all" ||
			row.operationalState === "unknown" ||
			row.staleState === "unknown" ||
			row.sourceKind === "visibility only"
		)
	}
	return true
}

export function actorNoiseHint(actor: FinancialActorFilter): string {
	const hints: Record<FinancialActorFilter, string> = {
		all: "Todos los casos visibles que pueden requerir atención.",
		financial_operations: "Excepciones abiertas, comprobantes faltantes y respuestas pendientes.",
		reconciliation_ops: "Montos que no coinciden, referencias duplicadas y registros sin reserva.",
		provider_finance: "Pagos pendientes, resúmenes desactualizados y dependencias por resolver.",
		provider_followup: "Casos que requieren respuesta del proveedor o de un equipo externo.",
		support: "Seguimiento de reembolsos y casos que esperan información externa.",
		admin: "Inconsistencias del sistema que requieren una revisión cuidadosa.",
	}
	return hints[actor] || hints.all
}
