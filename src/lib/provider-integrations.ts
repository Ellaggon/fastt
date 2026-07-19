import {
	db,
	desc,
	eq,
	and,
	ProviderAuditLog,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncLog,
} from "astro:db"
import { evaluateProviderGovernance } from "@/lib/provider-governance"

export type ProviderConnectorKey =
	| "payment_gateway"
	| "channel_manager"
	| "external_calendars"
	| "webhooks_api"
	| "accounting_export"

export type ProviderConnectorStatus =
	| "not_configured"
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
		connected: "Conectado",
		requires_attention: "Requiere atención",
		syncing: "Sincronizando",
		error: "Error",
		revoked: "Revocado",
	}
	return labels[status]
}

function statusTone(status: ProviderConnectorStatus): ProviderIntegrationCard["tone"] {
	if (status === "connected") return "success"
	if (status === "syncing") return "info"
	if (status === "requires_attention" || status === "revoked") return "warning"
	if (status === "error") return "error"
	return "neutral"
}

async function insertAudit(params: {
	providerId: string
	actorUserId?: string | null
	action: string
	entityId?: string | null
	afterJson?: unknown
	riskLevel?: "low" | "medium" | "high"
}) {
	await db
		.insert(ProviderAuditLog)
		.values({
			id: crypto.randomUUID(),
			providerId: params.providerId,
			actorUserId: params.actorUserId ?? undefined,
			action: params.action,
			entityType: "ProviderIntegrationConnection",
			entityId: params.entityId ?? undefined,
			afterJson: params.afterJson,
			riskLevel: params.riskLevel ?? "medium",
			createdAt: new Date(),
		})
		.catch(() => undefined)
}

export function listProviderConnectorCatalog(): ProviderConnectorCatalogItem[] {
	return connectorCatalog
}

export async function listProviderIntegrations(params: {
	providerId: string
	currentUserId?: string | null
}): Promise<ProviderIntegrationCard[]> {
	const governance = await evaluateProviderGovernance(params.providerId, {
		currentUserId: params.currentUserId,
		persist: true,
	})
	const connections = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(eq(ProviderIntegrationConnection.providerId, params.providerId))
		.all()
		.catch(() => [])
	const logs = await db
		.select()
		.from(ProviderIntegrationSyncLog)
		.where(eq(ProviderIntegrationSyncLog.providerId, params.providerId))
		.orderBy(desc(ProviderIntegrationSyncLog.createdAt))
		.limit(30)
		.all()
		.catch(() => [])

	return connectorCatalog.map((connector) => {
		const connection = connections.find((row) => row.connectorKey === connector.key)
		const status = String(connection?.status ?? "not_configured") as ProviderConnectorStatus
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
		.get()
		.catch(() => null)
	const now = new Date()
	const status: ProviderConnectorStatus = credentialsRef ? "connected" : "requires_attention"
	const values = {
		providerId: params.providerId,
		connectorKey,
		status,
		mode,
		scopesJson: scopes,
		credentialsRef: credentialsRef || undefined,
		errorMessage: credentialsRef ? undefined : "Falta referencia de credenciales.",
		lastSyncStatus: existing?.lastSyncStatus ?? undefined,
		lastSyncAt: existing?.lastSyncAt ?? undefined,
		updatedAt: now,
	}

	if (existing?.id) {
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
				? "Configuración actualizada."
				: "Configuración guardada con credenciales pendientes.",
			metadataJson: { scopes },
		})
		await insertAudit({
			providerId: params.providerId,
			actorUserId: params.currentUserId,
			action: "provider.integration.update",
			entityId: existing.id,
			afterJson: values,
		})
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
		eventType: "configuration.connected",
		status,
		mode,
		message: credentialsRef
			? "Conector configurado."
			: "Conector creado con credenciales pendientes.",
		metadataJson: { scopes },
	})
	await insertAudit({
		providerId: params.providerId,
		actorUserId: params.currentUserId,
		action: "provider.integration.connect",
		entityId: id,
		afterJson: values,
	})
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
		.get()
	if (!existing?.id) return null

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
		riskLevel: "high",
	})
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
		.get()
	if (!existing?.id) throw new Error("CONNECTION_NOT_FOUND")

	const hasCredentials = Boolean(String(existing.credentialsRef ?? "").trim())
	const status: ProviderConnectorStatus = hasCredentials ? "connected" : "error"
	const message = hasCredentials
		? "Sincronización de prueba completada."
		: "No se puede sincronizar sin credenciales."
	await db
		.update(ProviderIntegrationConnection)
		.set({
			status,
			lastSyncAt: new Date(),
			lastSyncStatus: hasCredentials ? "success" : "error",
			errorMessage: hasCredentials ? undefined : message,
			updatedAt: new Date(),
		})
		.where(eq(ProviderIntegrationConnection.id, existing.id))
	await insertIntegrationLog({
		providerId: params.providerId,
		connectorKey,
		connectionId: existing.id,
		eventType: "sync.test",
		status: hasCredentials ? "success" : "error",
		mode: normalizeMode(existing.mode),
		message,
		metadataJson: { scopes: existing.scopesJson ?? [] },
	})
	await insertAudit({
		providerId: params.providerId,
		actorUserId: params.currentUserId,
		action: "provider.integration.sync_test",
		entityId: existing.id,
		afterJson: { status, message },
	})
	return { status, message }
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
