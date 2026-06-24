export const queueLabels: Record<string, string> = {
	needs_action_today: "Requiere atención",
	blocked: "Bloqueado",
	ready_to_close: "Listo para cerrar",
	recently_closed: "Cerrado recientemente",
	needs_review: "Excepciones",
	reconciliation_issues: "Liquidaciones",
	refund_handoffs: "Reembolsos",
	provider_finance: "Pagos pendientes",
	evidence_issues: "Cobros",
	waiting_external: "Esperando respuesta",
	resolved_history: "Casos cerrados",
	advanced_all: "Todos los casos",
	all_open: "Excepciones",
	refund_handoff_required: "Reembolsos",
	missing_references: "Comprobante faltante",
	provider_finance_review: "Pagos pendientes",
	snapshot_gaps: "Datos de la reserva incompletos",
	evidence_unknown: "Comprobantes por confirmar",
	multi_room_review: "Reserva de varias habitaciones",
	clean_records: "Sin revisión pendiente",
	all: "Todos los casos",
}

export const operationalCategoryLabels: Record<string, string> = {
	collections: "Cobros",
	provider_payables: "Pagos pendientes",
	refunds: "Reembolsos",
	settlements: "Liquidaciones",
	exceptions: "Excepciones",
}

export const evidenceStateLabels: Record<string, string> = {
	all: "Cualquier disponibilidad",
	snapshot_ready: "Comprobantes suficientes",
	handoff_pending: "Esperando seguimiento",
	evidence_partial: "Faltan comprobantes",
	evidence_matched: "Los montos coinciden",
	evidence_unknown: "Comprobantes por confirmar",
}

export const statusLabels: Record<string, string> = {
	open: "requiere atención",
	acknowledged: "en revisión",
	waiting_external: "esperando respuesta",
	resolved: "cerrado",
	dismissed: "descartado",
}

export const ownerLabels: Record<string, string> = {
	financial_operations: "Operaciones financieras",
	reconciliation_ops: "Revisión de liquidaciones",
	reservations: "Reservas",
	provider_followup: "Seguimiento con proveedor",
	external_finance: "Equipo financiero externo",
	provider_finance: "Pagos a proveedores",
	support: "Soporte",
	none: "Sin responsable",
}

export const handoffStatusLabels: Record<string, string> = {
	required: "Reembolso por revisar",
	acknowledged: "Seguimiento iniciado",
	waiting_external: "Esperando respuesta",
	evidence_recorded: "Comprobante recibido",
	closed: "Cerrado",
	dismissed: "Descartado",
}

export const overlaySourceLabels: Record<string, string> = {
	derived_only: "derived signal",
	persisted_overlay: "persisted review",
	persisted: "persisted review",
	visibility_only: "visibility only",
}

export const workItemLabels: Record<string, string> = {
	clean_record: "Sin revisión pendiente",
	provider_finance_review: "Pago pendiente al proveedor",
	refund_handoff_required: "Reembolso por revisar",
	missing_payment_reference: "Falta el comprobante de cobro",
	missing_settlement_reference: "Falta el comprobante de liquidación",
	missing_refund_reference: "Falta el comprobante de reembolso",
	incomplete_contract_snapshot: "Faltan datos confirmados de la reserva",
	evidence_unknown: "Los comprobantes requieren confirmación",
	multi_room_review: "Revisar distribución de habitaciones",
}

export const providerFinanceQueueLabels: Record<string, string> = {
	provider_profile_incomplete: "Faltan datos financieros del proveedor",
	commission_snapshot_missing: "Falta el detalle de comisión acordada",
	provider_finance_dispute: "Los comprobantes deben revisarse primero",
	provider_statement_pending: "El resumen del proveedor requiere revisión",
	payout_reference_missing: "Falta la referencia financiera externa",
	payout_blocked: "El pago pendiente está bloqueado",
	payable_blocked: "El pago pendiente está bloqueado",
	statement_stale: "El resumen del proveedor quedó desactualizado",
	reconciliation_blocked: "Los montos deben revisarse primero",
	commission_missing: "Falta el detalle de comisión acordada",
	reference_missing: "Falta la referencia financiera externa",
	provider_finance_review: "Pago pendiente al proveedor",
}

export const reconciliationStatusLabels: Record<string, string> = {
	matched: "los montos coinciden",
	mismatch: "los montos no coinciden",
	missing_payment: "falta el comprobante de cobro",
	missing_settlement: "falta el comprobante de liquidación",
	currency_mismatch: "las monedas no coinciden",
	missing_reconciliation_match: "faltan importes comparables",
}

export const mismatchReasonLabels: Record<string, string> = {
	payment_amount_mismatch: "El cobro no coincide con el importe confirmado de la reserva",
	settlement_amount_mismatch: "La liquidación no coincide con el cobro registrado",
	duplicate_external_reference: "La misma referencia aparece en más de una reserva",
	missing_capture_reference: "Falta la referencia del cobro",
	refund_without_matching_cancellation: "Hay un reembolso sin una cancelación asociada",
	stale_review: "Los comprobantes cambiaron después de la última revisión",
	unmatched_payment_transaction: "Hay un cobro sin reserva asociada",
	unmatched_settlement_record: "Hay una liquidación sin reserva asociada",
}

export const staleReasonLabels: Record<string, string> = {
	commission_currency_mismatch: "La moneda de la comisión no coincide con la reserva",
	commission_basis_mismatch: "La comisión ya no coincide con las condiciones confirmadas",
	commission_amount_stale: "El importe de la comisión cambió desde la última revisión",
	payable_currency_mismatch: "La moneda del pago pendiente no coincide con la reserva",
	payable_gross_amount_stale: "El importe bruto cambió desde la última revisión",
	payable_commission_amount_stale: "La comisión cambió desde la última revisión",
	payable_tax_amount_stale: "Los impuestos cambiaron desde la última revisión",
	payable_net_amount_stale: "El importe pendiente al proveedor cambió desde la última revisión",
	statement_gross_amount_stale: "El importe bruto del resumen cambió desde la última revisión",
	statement_commission_amount_stale: "La comisión del resumen cambió desde la última revisión",
	statement_tax_amount_stale: "Los impuestos del resumen cambiaron desde la última revisión",
	statement_net_amount_stale: "El importe pendiente del resumen cambió desde la última revisión",
	statement_currency_mismatch: "La moneda del resumen no coincide con los pagos pendientes",
}

export function humanize(value: unknown, fallback = "-"): string {
	const raw = String(value ?? "").trim()
	if (!raw) return fallback
	return raw.replaceAll("_", " ")
}

export function labelFrom(map: Record<string, string>, value: unknown, fallback = "-"): string {
	const key = String(value ?? "").trim()
	return map[key] ?? humanize(key, fallback)
}
