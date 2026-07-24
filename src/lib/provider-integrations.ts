import {
	first,
	db,
	desc,
	eq,
	and,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncLog,
} from "@/shared/infrastructure/db/compat"
import { invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	evaluateProviderGovernance,
	readProviderGovernanceFromConfigurationState,
} from "@/lib/provider-governance"
import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"

export type ProviderConnectorKey =
	| "payment_gateway"
	| "channel_manager"
	| "external_calendars"
	| "webhooks_api"
	| "accounting_export"

export type ProviderConnectorStatus =
	| "not_configured"
	| "pending"
	| "connected"
	| "requires_attention"
	| "syncing"
	| "error"
	| "revoked"

export type ProviderConnectorMode = "sandbox" | "production"

export type ProviderConnectorCatalogItem = {
	key: ProviderConnectorKey
	name: string
	category: string
	description: string
	requirements: string[]
	defaultScopes: string[]
	availableScopes: Array<{ key: string; label: string }>
}

export type ProviderIntegrationCard = ProviderConnectorCatalogItem & {
	status: ProviderConnectorStatus
	statusLabel: string
	tone: "neutral" | "success" | "warning" | "error" | "info"
	mode: ProviderConnectorMode
	scopes: string[]
	credentialsRef: string
	lastSyncAt: Date | null
	lastSyncStatus: string | null
	errorMessage: string | null
	canUseProduction: boolean
	logs: Array<{
		id: string
		eventType: string
		status: string
		mode: string
		message: string | null
		createdAt: Date | null
	}>
}

const connectorCatalog: ProviderConnectorCatalogItem[] = [
	{
		key: "payment_gateway",
		name: "Pasarela de pago",
		category: "Cobros",
		description:
			"Autoriza cobros, conserva referencias de transacción y alimenta conciliación financiera.",
		requirements: ["Proveedor verificado", "Cuenta de pago validada", "Permisos de cobro"],
		defaultScopes: ["payments:authorize", "payments:refund", "reconciliation:write"],
		availableScopes: [
			{ key: "payments:authorize", label: "Autorizar cobros" },
			{ key: "payments:refund", label: "Gestionar reembolsos" },
			{ key: "reconciliation:write", label: "Enviar conciliación" },
		],
	},
	{
		key: "channel_manager",
		name: "Channel manager",
		category: "Distribución",
		description:
			"Sincroniza disponibilidad, tarifas y restricciones con canales externos bajo control de snapshots.",
		requirements: ["Tarifas listas", "Calendario operativo", "Reglas de venta saneadas"],
		defaultScopes: ["availability:sync", "rates:sync", "restrictions:sync"],
		availableScopes: [
			{ key: "availability:sync", label: "Sincronizar disponibilidad" },
			{ key: "rates:sync", label: "Sincronizar tarifas" },
			{ key: "restrictions:sync", label: "Sincronizar restricciones" },
		],
	},
	{
		key: "external_calendars",
		name: "Calendarios externos",
		category: "Operación",
		description:
			"Importa o exporta bloqueos operativos para equipos que trabajan con calendarios externos.",
		requirements: ["Unidades publicables", "Política de conflictos", "Auditoría de cambios"],
		defaultScopes: ["calendar:import", "calendar:export"],
		availableScopes: [
			{ key: "calendar:import", label: "Importar bloqueos" },
			{ key: "calendar:export", label: "Exportar disponibilidad" },
		],
	},
	{
		key: "webhooks_api",
		name: "Webhooks y API",
		category: "Automatización",
		description:
			"Gestiona credenciales, eventos y permisos para integraciones avanzadas con sistemas externos.",
		requirements: ["Roles definidos", "Scopes explícitos", "Logs de entrega"],
		defaultScopes: ["webhooks:deliver", "bookings:read", "inventory:read"],
		availableScopes: [
			{ key: "webhooks:deliver", label: "Enviar webhooks" },
			{ key: "bookings:read", label: "Leer reservas" },
			{ key: "inventory:read", label: "Leer inventario" },
		],
	},
	{
		key: "accounting_export",
		name: "Exportación contable",
		category: "Finanzas",
		description:
			"Exporta liquidaciones, impuestos y ajustes sin convertir Fastt en sistema contable primario.",
		requirements: ["Fiscalidad configurada", "Liquidaciones activas", "Mapeo de cuentas"],
		defaultScopes: ["settlements:export", "taxes:export", "adjustments:export"],
		availableScopes: [
			{ key: "settlements:export", label: "Exportar liquidaciones" },
			{ key: "taxes:export", label: "Exportar impuestos" },
			{ key: "adjustments:export", label: "Exportar ajustes" },
		],
	},
]

/** Simple-mode starters: payments + distribution (Airbnb/Expedia-shaped minimum). */
export const recommendedProviderConnectorKeys = [
	"payment_gateway",
	"channel_manager",
] as const satisfies ReadonlyArray<ProviderConnectorKey>

export function isRecommendedProviderConnector(key: string): boolean {
	return (recommendedProviderConnectorKeys as readonly string[]).includes(key)
}

const catalogByKey = new Map(connectorCatalog.map((connector) => [connector.key, connector]))

function normalizeConnectorKey(key: string): ProviderConnectorKey {
	const normalized = String(key ?? "").trim() as ProviderConnectorKey
	if (!catalogByKey.has(normalized)) throw new Error("CONNECTOR_NOT_FOUND")
	return normalized
}

function normalizeMode(value: unknown): ProviderConnectorMode {
	return value === "production" ? "production" : "sandbox"
}

function normalizeScopes(connector: ProviderConnectorCatalogItem, rawScopes: unknown): string[] {
	const requested = Array.isArray(rawScopes)
		? rawScopes
		: typeof rawScopes === "string"
			? [rawScopes]
			: []
	const allowed = new Set(connector.availableScopes.map((scope) => scope.key))
	const scopes = requested.map(String).filter((scope) => allowed.has(scope))
	return scopes.length ? Array.from(new Set(scopes)) : connector.defaultScopes
}

function statusLabel(status: ProviderConnectorStatus): string {
	const labels = {
		not_configured: "No configurado",
		pending: "Pendiente de prueba",
		connected: "Conectado",
		requires_attention: "Requiere atención",
		syncing: "Sincronizando",
		error: "Error",
		revoked: "Revocado",
	}
	return labels[status] ?? status
}

function statusTone(status: ProviderConnectorStatus): ProviderIntegrationCard["tone"] {
	if (status === "connected") return "success"
	if (status === "syncing" || status === "pending") return "info"
	if (status === "requires_attention" || status === "revoked") return "warning"
	if (status === "error") return "error"
	return "neutral"
}

function asConnectorStatus(value: unknown): ProviderConnectorStatus {
	const raw = String(value ?? "not_configured").trim()
	if (
		raw === "pending" ||
		raw === "connected" ||
		raw === "requires_attention" ||
		raw === "syncing" ||
		raw === "error" ||
		raw === "revoked" ||
		raw === "not_configured"
	) {
		return raw
	}
	return "not_configured"
}

function connectionAuditSnapshot(
	row: {
		id?: string | null
		connectorKey?: string | null
		status?: string | null
		mode?: string | null
		scopesJson?: unknown
		credentialsRef?: string | null
		lastSyncStatus?: string | null
		errorMessage?: string | null
	} | null
) {
	if (!row) return null
	return {
		id: row.id ?? null,
		connectorKey: row.connectorKey ?? null,
		status: row.status ?? null,
		mode: normalizeMode(row.mode),
		scopes: Array.isArray(row.scopesJson) ? row.scopesJson.map(String) : [],
		credentialsRef: row.credentialsRef ? String(row.credentialsRef) : null,
		lastSyncStatus: row.lastSyncStatus ? String(row.lastSyncStatus) : null,
		errorMessage: row.errorMessage ? String(row.errorMessage) : null,
	}
}

async function insertAudit(params: {
	providerId: string
	actorUserId?: string | null
	action: string
	entityId?: string | null
	beforeJson?: unknown
	afterJson?: unknown
	riskLevel?: "low" | "medium" | "high"
}) {
	if (!params.actorUserId) return
	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: params.action,
		entityType: "ProviderIntegrationConnection",
		entityId: params.entityId,
		beforeJson: params.beforeJson ?? null,
		afterJson: params.afterJson ?? null,
		riskLevel:
			params.riskLevel ??
			inferSettingsRiskLevel({
				domain: "integrations",
				changedKeys: ["status", "mode", "credentialsRef"],
			}),
	})
}

export function listProviderConnectorCatalog(): ProviderConnectorCatalogItem[] {
	return connectorCatalog
}

export async function listProviderIntegrations(params: {
	providerId: string
	currentUserId?: string | null
}): Promise<ProviderIntegrationCard[]> {
	const governance =
		(await readProviderGovernanceFromConfigurationState(params.providerId, {
			currentUserId: params.currentUserId,
		})) ??
		(await evaluateProviderGovernance(params.providerId, {
			currentUserId: params.currentUserId,
			persist: true,
		}))
	const connections = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(eq(ProviderIntegrationConnection.providerId, params.providerId))

		.catch(() => [])
	const logs = await db
		.select()
		.from(ProviderIntegrationSyncLog)
		.where(eq(ProviderIntegrationSyncLog.providerId, params.providerId))
		.orderBy(desc(ProviderIntegrationSyncLog.createdAt))
		.limit(30)

		.catch(() => [])

	return connectorCatalog.map((connector) => {
		const connection = connections.find((row) => row.connectorKey === connector.key)
		const status = asConnectorStatus(connection?.status ?? "not_configured")
		const mode = normalizeMode(connection?.mode)
		return {
			...connector,
			status,
			statusLabel: statusLabel(status),
			tone: statusTone(status),
			mode,
			scopes: Array.isArray(connection?.scopesJson)
				? connection.scopesJson.map(String)
				: connector.defaultScopes,
			credentialsRef: String(connection?.credentialsRef ?? ""),
			lastSyncAt: connection?.lastSyncAt ?? null,
			lastSyncStatus: connection?.lastSyncStatus ? String(connection.lastSyncStatus) : null,
			errorMessage: connection?.errorMessage ? String(connection.errorMessage) : null,
			canUseProduction: governance.capabilities.integrations,
			logs: logs
				.filter((row) => row.connectorKey === connector.key)
				.slice(0, 3)
				.map((row) => ({
					id: row.id,
					eventType: String(row.eventType),
					status: String(row.status),
					mode: String(row.mode),
					message: row.message ? String(row.message) : null,
					createdAt: row.createdAt ?? null,
				})),
		}
	})
}

export async function connectProviderIntegration(params: {
	providerId: string
	currentUserId?: string | null
	connectorKey: string
	mode: string
	scopes: unknown
	credentialsRef?: string | null
}) {
	const connectorKey = normalizeConnectorKey(params.connectorKey)
	const connector = catalogByKey.get(connectorKey)!
	const governance = await evaluateProviderGovernance(params.providerId, {
		currentUserId: params.currentUserId,
		persist: true,
	})
	const requestedMode = normalizeMode(params.mode)
	const mode =
		requestedMode === "production" && !governance.capabilities.integrations
			? "sandbox"
			: requestedMode
	const scopes = normalizeScopes(connector, params.scopes)
	const credentialsRef = String(params.credentialsRef ?? "").trim()
	const existing = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, connectorKey)
			)
		)
		.then(first)
		.catch(() => null)
	const now = new Date()
	// Credentials alone never mean "connected" (Expedia connectivity test / Airbnb channel smoke).
	const status: ProviderConnectorStatus = credentialsRef ? "pending" : "requires_attention"
	const values = {
		providerId: params.providerId,
		connectorKey,
		status,
		mode,
		scopesJson: scopes,
		credentialsRef: credentialsRef || undefined,
		errorMessage: credentialsRef
			? "Ejecuta una prueba de sync para marcar el conector como conectado."
			: "Falta referencia de credenciales.",
		lastSyncStatus: existing?.lastSyncStatus ?? undefined,
		lastSyncAt: existing?.lastSyncAt ?? undefined,
		updatedAt: now,
	}

	if (existing?.id) {
		const before = connectionAuditSnapshot(existing)
		await db
			.update(ProviderIntegrationConnection)
			.set(values)
			.where(eq(ProviderIntegrationConnection.id, existing.id))
		await insertIntegrationLog({
			providerId: params.providerId,
			connectorKey,
			connectionId: existing.id,
			eventType: "configuration.updated",
			status,
			mode,
			message: credentialsRef
				? "Configuración actualizada. Pendiente de prueba de sync."
				: "Configuración guardada con credenciales pendientes.",
			metadataJson: { scopes },
		})
		await insertAudit({
			providerId: params.providerId,
			actorUserId: params.currentUserId,
			action: "provider.integration.update",
			entityId: existing.id,
			beforeJson: before,
			afterJson: connectionAuditSnapshot({ id: existing.id, ...values }),
			riskLevel: inferSettingsRiskLevel({
				domain: "integrations",
				changedKeys: ["status", "mode", "credentialsRef", "scopes"],
			}),
		})
		await invalidateProviderGovernance(params.providerId, "provider_integration_updated")
		return existing.id
	}

	const id = crypto.randomUUID()
	await db.insert(ProviderIntegrationConnection).values({
		id,
		...values,
		createdAt: now,
	})
	await insertIntegrationLog({
		providerId: params.providerId,
		connectorKey,
		connectionId: id,
		eventType: "configuration.saved",
		status,
		mode,
		message: credentialsRef
			? "Conector configurado. Ejecuta una prueba de sync para activarlo."
			: "Conector creado con credenciales pendientes.",
		metadataJson: { scopes },
	})
	await insertAudit({
		providerId: params.providerId,
		actorUserId: params.currentUserId,
		action: "provider.integration.connect",
		entityId: id,
		beforeJson: null,
		afterJson: connectionAuditSnapshot({ id, ...values }),
		riskLevel: inferSettingsRiskLevel({
			domain: "integrations",
			changedKeys: ["status", "mode", "credentialsRef", "scopes"],
		}),
	})
	await invalidateProviderGovernance(params.providerId, "provider_integration_connected")
	return id
}

export async function revokeProviderIntegration(params: {
	providerId: string
	currentUserId?: string | null
	connectorKey: string
}) {
	const connectorKey = normalizeConnectorKey(params.connectorKey)
	const existing = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, connectorKey)
			)
		)
		.then(first)
	if (!existing?.id) return null

	const before = connectionAuditSnapshot(existing)
	const after = {
		...before,
		status: "revoked",
		credentialsRef: null,
		errorMessage: "Credenciales revocadas por el proveedor.",
	}

	await db
		.update(ProviderIntegrationConnection)
		.set({
			status: "revoked",
			credentialsRef: null,
			errorMessage: "Credenciales revocadas por el proveedor.",
			updatedAt: new Date(),
		})
		.where(eq(ProviderIntegrationConnection.id, existing.id))
	await insertIntegrationLog({
		providerId: params.providerId,
		connectorKey,
		connectionId: existing.id,
		eventType: "credentials.revoked",
		status: "revoked",
		mode: normalizeMode(existing.mode),
		message: "Acceso revocado.",
	})
	await insertAudit({
		providerId: params.providerId,
		actorUserId: params.currentUserId,
		action: "provider.integration.revoke",
		entityId: existing.id,
		beforeJson: before,
		afterJson: after,
		riskLevel: "high",
	})
	await invalidateProviderGovernance(params.providerId, "provider_integration_revoked")
	return existing.id
}

export async function syncProviderIntegration(params: {
	providerId: string
	currentUserId?: string | null
	connectorKey: string
}) {
	const connectorKey = normalizeConnectorKey(params.connectorKey)
	const existing = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, connectorKey)
			)
		)
		.then(first)
	if (!existing?.id) throw new Error("CONNECTION_NOT_FOUND")

	const credentialsRef = String(existing.credentialsRef ?? "").trim()
	const { runConnectorSmokeTest } = await import("@/lib/provider-connector-smoke")
	const smoke = await runConnectorSmokeTest({
		connectorKey,
		credentialsRef,
		mode: String(existing.mode ?? "sandbox"),
	})
	const status: ProviderConnectorStatus = smoke.ok ? "connected" : "error"
	const message = smoke.message
	const before = connectionAuditSnapshot(existing)
	await db
		.update(ProviderIntegrationConnection)
		.set({
			status,
			lastSyncAt: new Date(),
			lastSyncStatus: smoke.ok ? "success" : "error",
			errorMessage: smoke.ok ? null : message,
			updatedAt: new Date(),
		})
		.where(eq(ProviderIntegrationConnection.id, existing.id))
	await insertIntegrationLog({
		providerId: params.providerId,
		connectorKey,
		connectionId: existing.id,
		eventType: "sync.test",
		status: smoke.ok ? "success" : "error",
		mode: normalizeMode(existing.mode),
		message,
		metadataJson: {
			scopes: existing.scopesJson ?? [],
			smokeTest: true,
			probe: smoke.probe,
			latencyMs: smoke.latencyMs,
		},
	})
	await insertAudit({
		providerId: params.providerId,
		actorUserId: params.currentUserId,
		action: "provider.integration.sync_test",
		entityId: existing.id,
		beforeJson: before,
		afterJson: connectionAuditSnapshot({
			...existing,
			status,
			lastSyncStatus: smoke.ok ? "success" : "error",
			errorMessage: smoke.ok ? null : message,
		}),
		riskLevel: "medium",
	})
	await invalidateProviderGovernance(params.providerId, "provider_integration_sync_tested")
	return { status, message, smoke }
}

async function insertIntegrationLog(params: {
	providerId: string
	connectorKey: ProviderConnectorKey
	connectionId?: string | null
	eventType: string
	status: string
	mode: ProviderConnectorMode
	message?: string | null
	metadataJson?: unknown
}) {
	await db.insert(ProviderIntegrationSyncLog).values({
		id: crypto.randomUUID(),
		providerId: params.providerId,
		connectorKey: params.connectorKey,
		connectionId: params.connectionId ?? undefined,
		eventType: params.eventType,
		status: params.status,
		mode: params.mode,
		message: params.message ?? undefined,
		metadataJson: params.metadataJson,
		createdAt: new Date(),
	})
}
