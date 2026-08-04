export const providerIntegrationOperationalSteps = [
	{ key: "access", label: "Acceso validado" },
	{ key: "mapping", label: "Mapeo pendiente" },
	{ key: "ready", label: "Lista para sincronizar" },
	{ key: "initial_sync", label: "Sincronización inicial" },
	{ key: "operational", label: "Operativa" },
	{ key: "attention", label: "Requiere atención" },
] as const

export type ProviderIntegrationOperationalStage =
	(typeof providerIntegrationOperationalSteps)[number]["key"]

export type ProviderIntegrationOperationalState = {
	stage: ProviderIntegrationOperationalStage
	label: string
	description: string
	tone: "neutral" | "info" | "success" | "warning" | "error"
	stepIndex: number
}

type InitialSyncState = "none" | "queued" | "running" | "succeeded" | "partial" | "failed"

export function deriveProviderIntegrationOperationalState(input: {
	connectionStatus: string
	accessValidated: boolean
	coverageComplete: boolean
	initialSyncState: InitialSyncState
	hasAttention: boolean
}): ProviderIntegrationOperationalState {
	if (
		input.connectionStatus === "revoked" ||
		input.connectionStatus === "error" ||
		input.connectionStatus === "requires_attention" ||
		input.initialSyncState === "partial" ||
		input.initialSyncState === "failed" ||
		input.hasAttention
	) {
		return {
			stage: "attention",
			label: "Requiere atención",
			description: "Hay un problema que debe resolverse antes de continuar con normalidad.",
			tone: "warning",
			stepIndex: 5,
		}
	}
	if (input.initialSyncState === "queued" || input.initialSyncState === "running") {
		return {
			stage: "initial_sync",
			label: "Sincronización inicial",
			description: "Fastt está preparando o enviando el primer estado comercial.",
			tone: "info",
			stepIndex: 3,
		}
	}
	if (input.initialSyncState === "succeeded") {
		return {
			stage: "operational",
			label: "Operativa",
			description: "La conexión puede enviar cambios y recibir reservas.",
			tone: "success",
			stepIndex: 4,
		}
	}
	if (input.coverageComplete) {
		return {
			stage: "ready",
			label: "Lista para sincronizar",
			description: "Habitaciones y tarifas vendibles tienen cobertura completa.",
			tone: "success",
			stepIndex: 2,
		}
	}
	if (input.accessValidated) {
		return {
			stage: "mapping",
			label: "Mapeo pendiente",
			description: "El acceso funciona; falta relacionar el inventario vendible.",
			tone: "info",
			stepIndex: 1,
		}
	}
	return {
		stage: "access",
		label: "Acceso por validar",
		description: "Prueba la conexión para confirmar que la credencial funciona.",
		tone: "neutral",
		stepIndex: 0,
	}
}
