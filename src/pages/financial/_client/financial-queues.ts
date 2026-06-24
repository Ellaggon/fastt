export const primaryQueueOptions = [
	{ value: "needs_action_today", label: "Atención prioritaria" },
	{ value: "collections", label: "Cobros" },
	{ value: "provider_payables", label: "Pagos pendientes" },
	{ value: "refunds", label: "Reembolsos" },
	{ value: "settlements", label: "Liquidaciones" },
	{ value: "exceptions", label: "Excepciones" },
	{ value: "waiting_external", label: "Esperando respuesta" },
	{ value: "blocked", label: "Bloqueados" },
	{ value: "ready_to_close", label: "Listos para cerrar" },
	{ value: "recently_closed", label: "Cerrados recientemente" },
	{ value: "resolved_history", label: "Historial cerrado" },
	{ value: "advanced_all", label: "Todos los casos" },
] as const

export const primarySummaryQueues = [
	{ label: "Requieren atención", queue: "needs_action_today" },
	{ label: "Esperando respuesta", queue: "waiting_external" },
	{ label: "Bloqueados", queue: "blocked" },
	{ label: "Listos para cerrar", queue: "ready_to_close" },
	{ label: "Cerrados recientemente", queue: "recently_closed" },
] as const
