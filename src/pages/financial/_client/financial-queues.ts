export const primaryQueueOptions = [
	{ value: "needs_action_today", label: "Atención prioritaria" },
	{ value: "blocked", label: "Bloqueados" },
	{ value: "waiting_external", label: "Esperando respuesta" },
	{ value: "ready_to_close", label: "Listos para cerrar" },
	{ value: "recently_closed", label: "Cerrados recientemente" },
] as const

export const primarySummaryQueues = [
	{ label: "Requieren atención", queue: "needs_action_today" },
	{ label: "Bloqueados", queue: "blocked" },
	{ label: "Esperando respuesta", queue: "waiting_external" },
	{ label: "Listos para cerrar", queue: "ready_to_close" },
	{ label: "Cerrados recientemente", queue: "recently_closed" },
] as const
