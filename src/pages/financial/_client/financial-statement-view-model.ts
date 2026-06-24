import { staleReasonLabels } from "./financial-labels"

export type FinancialStatementViewModel = {
	visible: boolean
	title: string
	state: string
	freshness: string
	includedBookings: number
	excludedBookings: number
	staleReasons: string[]
	dependencies: string[]
	nextAction: string
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

function humanState(value: unknown): string {
	const labels: Record<string, string> = {
		pending: "Pendiente de revisión",
		visible: "Disponible para revisión",
		recorded: "Referencia registrada",
		fresh: "Actualizado",
		stale: "Requiere otra revisión",
		missing: "Información faltante",
		unknown: "Por confirmar",
	}
	const state = String(value || "unknown")
	return labels[state] || "Por confirmar"
}

export function buildFinancialStatementViewModel(finance: any): FinancialStatementViewModel {
	const statement = finance?.statement || {}
	const staleReasons = Array.isArray(statement?.staleReasons)
		? statement.staleReasons.map(
				(reason: unknown) =>
					staleReasonLabels[String(reason || "")] ||
					"El resumen ya no coincide con la información más reciente"
			)
		: []
	const dependencies = [
		finance?.reconciliation?.readyForPayable
			? "Los importes ya fueron revisados"
			: "Los importes todavía requieren revisión",
		statement?.state === "fresh"
			? "El resumen del proveedor está actualizado"
			: "El resumen del proveedor requiere otra revisión",
	].filter(Boolean)
	return {
		visible: Boolean(finance),
		title: "Resumen del proveedor",
		state: humanState(statement?.state || "unknown"),
		freshness: humanFreshness(statement?.freshness || statement?.state || "unknown"),
		includedBookings: Number(statement?.includedBookings || statement?.includedBookingCount || 0),
		excludedBookings: Number(statement?.excludedBookings || statement?.excludedBookingCount || 0),
		staleReasons,
		dependencies,
		nextAction:
			statement?.state === "fresh"
				? "Mantén el resumen disponible para revisión."
				: "Revisa que el resumen coincida con la información más reciente.",
	}
}
