import {
	and,
	db,
	desc,
	eq,
	inArray,
	ProviderAuditLog,
	ProviderIntegrationConnection,
	ProviderIntegrationCredential,
	ProviderIntegrationMapping,
	ProviderIntegrationSyncRun,
} from "@/shared/infrastructure/db/compat"
import { invalidateProviderGovernance } from "@/lib/cache/invalidation"
import { refreshConnectorOAuthToken } from "@/lib/provider-connector-oauth"
import {
	fetchChannelManagerRemoteCatalog,
	fetchChannelManagerRemoteProperties,
	type RemoteChannelManagerCatalogResult,
	type RemoteChannelManagerPropertyResult,
} from "@/lib/provider-channel-manager-properties"
import {
	evaluateProviderGovernance,
	readProviderGovernanceFromConfigurationState,
} from "@/lib/provider-governance"
import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import {
	decryptProviderIntegrationSecret,
	encryptProviderIntegrationSecret,
	isProviderIntegrationTokenExpired,
	shouldRefreshProviderIntegrationToken,
	type ProviderIntegrationVaultPayload,
} from "@/lib/provider-integration-vault"
import {
	getChannelManagerVendor,
	normalizeChannelManagerAuthType,
	normalizeChannelManagerVendorKey,
	type ChannelManagerAuthType,
	type ChannelManagerVendorKey,
} from "@/lib/provider-channel-manager-vendors"

export type ProviderConnectorKey =
	| "channel_manager"
	| "external_calendars"
	| "webhooks_api"
	| "accounting_export"

/**
 * Provider-facing integrations that have a complete operational workflow.
 * The remaining connector keys are retained only for historical data and audit compatibility.
 */
export const providerIntegrationWorkspaceConnectorKeys = [
	"channel_manager",
	"external_calendars",
] as const satisfies ReadonlyArray<ProviderConnectorKey>

export function isProviderIntegrationWorkspaceConnector(
	key: unknown
): key is (typeof providerIntegrationWorkspaceConnectorKeys)[number] {
	return (providerIntegrationWorkspaceConnectorKeys as readonly string[]).includes(
		String(key ?? "")
	)
}

/**
 * Conceptual product limits for Connection.catalogJson (smoke/preview cache).
 * Not a remote-entity model — durable local↔external bindings live in
 * ProviderIntegrationMapping. See docs/engineering/provider-settings-table-taxonomy.md
 * (Phase 6).
 */
export const PROVIDER_INTEGRATION_CATALOG_CACHE = {
	/** Max UTF-8 JSON size stored on Connection; overflow becomes a stub note. */
	maxBytes: 32 * 1024,
	/** Informational freshness window via lastCatalogSyncAt (not a hard eviction). */
	ttlMs: 7 * 24 * 60 * 60 * 1000,
} as const

export type ProviderIntegrationCatalogCachePayload = {
	vendorKey: ChannelManagerVendorKey
	authType: ChannelManagerAuthType
	externalPropertyId: string | null
	lastSmokeProbe: string | null
	lastSmokeMessage: string
	note: string
}

/** Build a size-capped smoke/preview cache blob for channel-manager connections. */
export function buildChannelManagerCatalogCache(params: {
	vendorKey: string | null | undefined
	authType: string | null | undefined
	externalPropertyId: string | null | undefined
	lastSmokeProbe: string | null | undefined
	lastSmokeMessage: string
}): ProviderIntegrationCatalogCachePayload {
	const payload: ProviderIntegrationCatalogCachePayload = {
		vendorKey: normalizeChannelManagerVendorKey(params.vendorKey),
		authType: normalizeChannelManagerAuthType(params.authType),
		externalPropertyId: params.externalPropertyId ?? null,
		lastSmokeProbe: params.lastSmokeProbe ?? null,
		lastSmokeMessage: params.lastSmokeMessage,
		note: "Conexión API verificada. El catálogo remoto detallado se importará en una fase vendor-specific.",
	}
	const serialized = JSON.stringify(payload)
	if (serialized.length <= PROVIDER_INTEGRATION_CATALOG_CACHE.maxBytes) return payload
	return {
		...payload,
		lastSmokeMessage: params.lastSmokeMessage.slice(0, 240),
		note: "Smoke cache truncated: exceeded PROVIDER_INTEGRATION_CATALOG_CACHE.maxBytes. Not catalog SoT.",
	}
}

/** True when lastCatalogSyncAt is older than the conceptual catalog-cache TTL. */
export function isProviderIntegrationCatalogCacheStale(
	lastCatalogSyncAt: Date | null | undefined,
	now: Date = new Date()
): boolean {
	if (!lastCatalogSyncAt) return true
	return now.getTime() - lastCatalogSyncAt.getTime() > PROVIDER_INTEGRATION_CATALOG_CACHE.ttlMs
}

export type ProviderConnectorStatus =
	| "not_configured"
	| "pending"
	| "connected"
	| "requires_attention"
	| "syncing"
	| "error"
	| "revoked"

export const PROVIDER_CONNECTOR_STATUSES = [
	"not_configured",
	"pending",
	"connected",
	"requires_attention",
	"syncing",
	"error",
	"revoked",
] as const satisfies readonly ProviderConnectorStatus[]

export const PROVIDER_CONNECTOR_MODES = ["sandbox", "production"] as const

/** Reject unknown Connection.status values (mirrors DB CHECK). */
export function assertProviderConnectorStatus(value: unknown): ProviderConnectorStatus {
	const raw = String(value ?? "").trim()
	if ((PROVIDER_CONNECTOR_STATUSES as readonly string[]).includes(raw)) {
		return raw as ProviderConnectorStatus
	}
	throw new Error("CONNECTION_STATUS_INVALID")
}

/** Reject unknown Connection.mode values (mirrors DB CHECK). */
export function assertProviderConnectorMode(value: unknown): "sandbox" | "production" {
	const raw = String(value ?? "").trim()
	if ((PROVIDER_CONNECTOR_MODES as readonly string[]).includes(raw)) {
		return raw as "sandbox" | "production"
	}
	throw new Error("CONNECTION_MODE_INVALID")
}

export type ProviderConnectorMode = "sandbox" | "production"

export type ProviderConnectorCatalogItem = {
	key: ProviderConnectorKey
	name: string
	category: string
	description: string
	requirements: string[]
	defaultScopes: string[]
	availableScopes: Array<{ key: string; label: string }>
	/** Short host-facing setup help shown in Pro mode. */
	docsLite: {
		title: string
		steps: string[]
		tip?: string
	}
}

export type ProviderIntegrationActivityItem = {
	id: string
	eventType: string
	status: string
	message: string | null
	createdAt: Date | null
	source: "sync_run" | "audit"
}

export type ProviderIntegrationCard = ProviderConnectorCatalogItem & {
	connectionId: string | null
	connectionCount: number
	status: ProviderConnectorStatus
	statusLabel: string
	tone: "neutral" | "success" | "warning" | "error" | "info"
	mode: ProviderConnectorMode
	scopes: string[]
	endpointUrl: string
	hasCredential: boolean
	vendorKey: ChannelManagerVendorKey
	vendorLabel: string
	authType: ChannelManagerAuthType
	externalPropertyId: string | null
	lastSyncAt: Date | null
	lastSyncStatus: string | null
	errorMessage: string | null
	canUseProduction: boolean
	instances: Array<{
		id: string
		displayName: string
		status: ProviderConnectorStatus
		statusLabel: string
		tone: ProviderIntegrationCard["tone"]
		mode: ProviderConnectorMode
		isPrimary: boolean
		lastSyncAt: Date | null
		lastSyncStatus: string | null
		errorMessage: string | null
		hasVaultCredential: boolean
		tokenExpiresAt: Date | null
		vendorKey: ChannelManagerVendorKey
		vendorLabel: string
		authType: ChannelManagerAuthType
		externalPropertyId: string | null
	}>
	/** Recent activity from SyncRun + config Audit (not SyncLog). */
	recentActivity: ProviderIntegrationActivityItem[]
}

const INTEGRATION_CONFIG_AUDIT_ACTIONS = [
	"provider.integration.connect",
	"provider.integration.update",
	"provider.integration.revoke",
	"provider.integration.credential_refresh",
] as const

export function integrationActivityEventLabel(eventType: string): string {
	switch (eventType) {
		case "sync.test":
		case "connection_test":
			return "Prueba de conexión"
		case "calendar.sync":
		case "calendar_import":
			return "Sincronización iCal"
		case "configuration.saved":
			return "Conexión creada"
		case "configuration.updated":
			return "Configuración actualizada"
		case "credentials.revoked":
			return "Acceso revocado"
		case "credentials.refreshed":
			return "OAuth renovado"
		default:
			return eventType
	}
}

export function integrationRunOperationLabel(operation: string): string {
	return integrationActivityEventLabel(operation)
}

function activityStatusFromRun(status: string): string {
	if (status === "succeeded") return "success"
	if (status === "failed" || status === "cancelled") return "error"
	if (status === "partial") return "partial"
	return status
}

function activityMessageFromRun(run: {
	operation: string
	status: string
	errorMessage?: string | null
	summaryJson?: unknown
	readCount?: number | null
	changedCount?: number | null
}): string {
	if (run.errorMessage) return String(run.errorMessage)
	if (run.operation === "calendar_import") {
		const summary =
			run.summaryJson && typeof run.summaryJson === "object"
				? (run.summaryJson as Record<string, unknown>)
				: null
		const imported = Number(summary?.imported ?? run.changedCount ?? run.readCount ?? 0)
		if (run.status === "succeeded") {
			return imported === 1
				? "1 bloqueo iCal reconciliado."
				: `${imported} bloqueos iCal reconciliados.`
		}
		return "Sincronización de calendario incompleta."
	}
	if (run.operation === "connection_test") {
		return run.status === "succeeded"
			? "Prueba de conexión correcta."
			: "La prueba de conexión no se completó."
	}
	return run.status === "succeeded" ? "Ejecución completada." : "Ejecución con errores."
}

function activityFromSyncRun(run: {
	id: string
	connectorKey: string
	operation: string
	status: string
	errorMessage?: string | null
	summaryJson?: unknown
	readCount?: number | null
	changedCount?: number | null
	startedAt?: Date | null
	createdAt?: Date | null
}): ProviderIntegrationActivityItem & { connectorKey: string } {
	const eventType =
		run.operation === "calendar_import"
			? "calendar.sync"
			: run.operation === "connection_test"
				? "sync.test"
				: String(run.operation)
	return {
		id: run.id,
		connectorKey: String(run.connectorKey),
		eventType,
		status: activityStatusFromRun(String(run.status)),
		message: activityMessageFromRun(run),
		createdAt: run.startedAt ?? run.createdAt ?? null,
		source: "sync_run",
	}
}

function activityFromAudit(params: {
	id: string
	action: string
	connectorKey: string
	createdAt: Date | null
}): ProviderIntegrationActivityItem & { connectorKey: string } {
	const eventType =
		params.action === "provider.integration.connect"
			? "configuration.saved"
			: params.action === "provider.integration.update"
				? "configuration.updated"
				: params.action === "provider.integration.revoke"
					? "credentials.revoked"
					: params.action === "provider.integration.credential_refresh"
						? "credentials.refreshed"
						: params.action
	const message =
		eventType === "configuration.saved"
			? "Conector configurado. Ejecuta una prueba de conexión antes de usarlo como validado."
			: eventType === "configuration.updated"
				? "Configuración actualizada."
				: eventType === "credentials.revoked"
					? "Acceso revocado."
					: eventType === "credentials.refreshed"
						? "Autorización OAuth renovada."
						: null
	const status =
		eventType === "credentials.revoked"
			? "revoked"
			: eventType === "credentials.refreshed"
				? "success"
				: "pending"
	return {
		id: params.id,
		connectorKey: params.connectorKey,
		eventType,
		status,
		message,
		createdAt: params.createdAt,
		source: "audit",
	}
}

function connectorKeyFromAuditRow(
	row: { entityId?: string | null; beforeJson?: unknown; afterJson?: unknown },
	connectionsById: Map<string, { connectorKey: string }>
): string | null {
	if (row.entityId && connectionsById.has(row.entityId)) {
		return connectionsById.get(row.entityId)!.connectorKey
	}
	const after =
		row.afterJson && typeof row.afterJson === "object"
			? (row.afterJson as Record<string, unknown>)
			: null
	const before =
		row.beforeJson && typeof row.beforeJson === "object"
			? (row.beforeJson as Record<string, unknown>)
			: null
	const key = after?.connectorKey ?? before?.connectorKey
	return key ? String(key) : null
}

const connectorCatalog: ProviderConnectorCatalogItem[] = [
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
		docsLite: {
			title: "Cómo conectar el channel manager",
			steps: [
				"Elige proveedor: Cloudbeds, Channex u otro. Fastt guarda el vendor en la conexión.",
				"Para Cloudbeds usa API key/OAuth y prueba getHotels; para Channex usa user-api-key y prueba properties.",
				"Después crea mappings de habitaciones/tarifas antes de activar sincronizaciones de producción.",
			],
			tip: "La prueba API valida acceso. El envío completo de ARI por vendor debe pasar por cola, mappings y límites del proveedor.",
		},
	},
	{
		key: "external_calendars",
		name: "Calendarios externos",
		category: "Operación",
		description:
			"Importa bloqueos iCal por habitación, con actualización manual y detección de conflictos.",
		requirements: ["Unidades publicables", "URL iCal segura", "Revisión de conflictos"],
		defaultScopes: ["calendar:import"],
		availableScopes: [{ key: "calendar:import", label: "Importar bloqueos" }],
		docsLite: {
			title: "Cómo conectar calendarios",
			steps: [
				"Obtén la URL de exportación iCal del canal externo.",
				"Agrega un feed por cada calendario y asígnalo a su habitación o unidad.",
				"Actualiza el feed y revisa los posibles conflictos antes de abrir disponibilidad.",
			],
			tip: "Este MVP importa bloqueos. La exportación queda desactivada para evitar bucles.",
		},
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
		docsLite: {
			title: "Cómo conectar webhooks / API",
			steps: [
				"En tu sistema, crea un endpoint https que reciba eventos.",
				"Pega la URL aquí, marca solo los permisos que necesitas y guarda.",
				"Prueba la conexión y revisa la actividad reciente para confirmar entregas.",
			],
			tip: "Menos permisos = menos riesgo. Activa bookings/inventory solo si tu integración los usa.",
		},
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
		docsLite: {
			title: "Cómo conectar exportación contable",
			steps: [
				"Configura primero el registro fiscal y al menos una cuenta de liquidación.",
				"Pega la referencia del conector contable (URL o ID de integración).",
				"Elige qué exportar (liquidaciones / impuestos / ajustes), guarda y prueba.",
			],
			tip: "Sin identidad fiscal verificada, la exportación de impuestos puede quedar incompleta.",
		},
	},
]

export function listProviderConnectorCatalog(): ProviderConnectorCatalogItem[] {
	return connectorCatalog.map((item) => ({
		...item,
		availableScopes: item.availableScopes.map((scope) => ({ ...scope })),
		requirements: [...item.requirements],
		defaultScopes: [...item.defaultScopes],
		docsLite: {
			...item.docsLite,
			steps: [...item.docsLite.steps],
		},
	}))
}

/** Simple mode starts with distribution; Fastt owns guest payment orchestration centrally. */
export const recommendedProviderConnectorKeys = [
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

function normalizePublicEndpoint(value: unknown): string {
	const raw = String(value ?? "").trim()
	if (!raw) return ""
	try {
		const url = new URL(raw)
		if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
			throw new Error("INTEGRATION_ENDPOINT_INVALID")
		}
		return url.toString()
	} catch {
		throw new Error("INTEGRATION_ENDPOINT_INVALID")
	}
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
		not_configured: "Por configurar",
		pending: "Referencia guardada",
		connected: "Validado por prueba",
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
	try {
		return assertProviderConnectorStatus(value)
	} catch {
		return "not_configured"
	}
}

function connectionAuditSnapshot(
	row: {
		id?: string | null
		connectorKey?: string | null
		status?: string | null
		mode?: string | null
		scopesJson?: unknown
		endpointUrl?: string | null
		hasCredential?: boolean
		tokenExpiresAt?: Date | null
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
		endpointUrl: row.endpointUrl ? String(row.endpointUrl) : null,
		hasCredential: Boolean(row.hasCredential),
		tokenExpiresAt: row.tokenExpiresAt instanceof Date ? row.tokenExpiresAt.toISOString() : null,
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
				changedKeys: ["status", "mode", "endpointUrl", "credential"],
			}),
	})
}

export async function listProviderIntegrations(params: {
	providerId: string
	currentUserId?: string | null
	includeRecentActivity?: boolean
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
	const [runs, audits, credentials] = await Promise.all([
		params.includeRecentActivity
			? db
					.select()
					.from(ProviderIntegrationSyncRun)
					.where(eq(ProviderIntegrationSyncRun.providerId, params.providerId))
					.orderBy(desc(ProviderIntegrationSyncRun.startedAt))
					.limit(40)
					.catch(() => [])
			: Promise.resolve([]),
		params.includeRecentActivity
			? db
					.select()
					.from(ProviderAuditLog)
					.where(
						and(
							eq(ProviderAuditLog.providerId, params.providerId),
							eq(ProviderAuditLog.entityType, "ProviderIntegrationConnection"),
							inArray(ProviderAuditLog.action, [...INTEGRATION_CONFIG_AUDIT_ACTIONS])
						)
					)
					.orderBy(desc(ProviderAuditLog.createdAt))
					.limit(40)
					.catch(() => [])
			: Promise.resolve([]),
		db
			.select()
			.from(ProviderIntegrationCredential)
			.where(eq(ProviderIntegrationCredential.providerId, params.providerId))
			.catch(() => []),
	])

	const connectionsById = new Map(
		connections.map((row) => [row.id, { connectorKey: String(row.connectorKey) }])
	)
	const activityFeed = [
		...runs.map((run) => activityFromSyncRun(run)),
		...audits.flatMap((row) => {
			const connectorKey = connectorKeyFromAuditRow(row, connectionsById)
			if (!connectorKey) return []
			return [
				activityFromAudit({
					id: row.id,
					action: String(row.action),
					connectorKey,
					createdAt: row.createdAt ?? null,
				}),
			]
		}),
	].sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))

	return connectorCatalog.map((connector) => {
		const connectorConnections = connections
			.filter((row) => row.connectorKey === connector.key)
			.sort(
				(a, b) =>
					Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) ||
					Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0)
			)
		const connection = connectorConnections[0]
		const activeCredential = credentials.find(
			(credential) => credential.connectionId === connection?.id && !credential.revokedAt
		)
		const status = asConnectorStatus(connection?.status ?? "not_configured")
		const mode = normalizeMode(connection?.mode)
		return {
			...connector,
			connectionId: connection?.id ?? null,
			connectionCount: connectorConnections.length,
			status,
			statusLabel: statusLabel(status),
			tone: statusTone(status),
			mode,
			scopes: Array.isArray(connection?.scopesJson)
				? connection.scopesJson.map(String)
				: connector.defaultScopes,
			endpointUrl: String(connection?.endpointUrl ?? ""),
			hasCredential: Boolean(activeCredential),
			lastSyncAt: connection?.lastSyncAt ?? null,
			lastSyncStatus: connection?.lastSyncStatus ? String(connection.lastSyncStatus) : null,
			errorMessage: connection?.errorMessage ? String(connection.errorMessage) : null,
			vendorKey: normalizeChannelManagerVendorKey(connection?.vendorKey),
			vendorLabel: getChannelManagerVendor(connection?.vendorKey).name,
			authType: normalizeChannelManagerAuthType(connection?.authType),
			externalPropertyId: connection?.externalPropertyId
				? String(connection.externalPropertyId)
				: null,
			canUseProduction: governance.capabilities.integrations,
			instances: connectorConnections.map((row, index) => {
				const instanceStatus = asConnectorStatus(row.status)
				const vendor = getChannelManagerVendor(row.vendorKey)
				return {
					id: row.id,
					displayName:
						String(row.displayName ?? "").trim() ||
						`${connector.name}${connectorConnections.length > 1 ? ` ${index + 1}` : ""}`,
					status: instanceStatus,
					statusLabel: statusLabel(instanceStatus),
					tone: statusTone(instanceStatus),
					mode: normalizeMode(row.mode),
					isPrimary: Boolean(row.isPrimary),
					lastSyncAt: row.lastSyncAt ?? null,
					lastSyncStatus: row.lastSyncStatus ? String(row.lastSyncStatus) : null,
					errorMessage: row.errorMessage ? String(row.errorMessage) : null,
					hasVaultCredential: credentials.some(
						(credential) => credential.connectionId === row.id && !credential.revokedAt
					),
					tokenExpiresAt:
						credentials.find(
							(credential) => credential.connectionId === row.id && !credential.revokedAt
						)?.tokenExpiresAt ?? null,
					vendorKey: vendor.key,
					vendorLabel: vendor.name,
					authType: normalizeChannelManagerAuthType(row.authType),
					externalPropertyId: row.externalPropertyId ? String(row.externalPropertyId) : null,
				}
			}),
			recentActivity: activityFeed
				.filter((row) => row.connectorKey === connector.key)
				.slice(0, 3)
				.map((row) => ({
					id: row.id,
					eventType: row.eventType,
					status: row.status,
					message: row.message,
					createdAt: row.createdAt,
					source: row.source,
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
	endpointUrl?: string | null
	credentialSecret?: string | null
	connectionId?: string | null
	displayName?: string | null
	createNew?: boolean
	vendorKey?: string | null
	authType?: string | null
	externalPropertyId?: string | null
	oauthCredential?: {
		accessToken: string
		refreshToken?: string | null
		tokenType?: string | null
		expiresIn?: number | null
		scope?: string | null
	}
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
	const endpointUrl = normalizePublicEndpoint(params.endpointUrl)
	const credentialSecret = String(params.credentialSecret ?? "").trim()
	const vendorKey =
		connectorKey === "channel_manager"
			? normalizeChannelManagerVendorKey(params.vendorKey)
			: "generic"
	const authType =
		connectorKey === "channel_manager"
			? normalizeChannelManagerAuthType(params.authType)
			: "reference"
	const externalPropertyId =
		String(params.externalPropertyId ?? "")
			.trim()
			.slice(0, 120) || null
	const connectorConnections = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, connectorKey)
			)
		)
		.catch(() => [])
	const existingCredentialRows = await db
		.select()
		.from(ProviderIntegrationCredential)
		.where(eq(ProviderIntegrationCredential.providerId, params.providerId))
		.catch(() => [])
	let existing = params.connectionId
		? (connectorConnections.find((row) => row.id === params.connectionId) ?? null)
		: params.createNew
			? null
			: (connectorConnections.find((row) => row.isPrimary) ?? connectorConnections[0] ?? null)
	if (params.connectionId && !existing) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND")
	const now = new Date()
	const hasExistingCredential = Boolean(
		existing &&
		existingCredentialRows.some((row) => row.connectionId === existing?.id && !row.revokedAt)
	)
	const hasCredential = Boolean(credentialSecret || params.oauthCredential || hasExistingCredential)
	const hasConnectionMaterial =
		connectorKey === "external_calendars" || Boolean(endpointUrl || hasCredential)
	// Credentials alone never mean "connected" (Expedia connectivity test / Airbnb channel smoke).
	const status: ProviderConnectorStatus = hasConnectionMaterial ? "pending" : "requires_attention"
	const values = {
		providerId: params.providerId,
		connectorKey,
		displayName:
			String(params.displayName ?? existing?.displayName ?? "")
				.trim()
				.slice(0, 100) ||
			`${connector.name}${existing || !connectorConnections.length ? "" : ` ${connectorConnections.length + 1}`}`,
		status,
		mode,
		scopesJson: scopes,
		endpointUrl: endpointUrl || null,
		vendorKey,
		authType,
		externalPropertyId,
		errorMessage: hasConnectionMaterial
			? "Ejecuta una prueba de conexión antes de usar este conector como validado."
			: "Falta configurar el endpoint o la credencial.",
		lastSyncStatus: existing?.lastSyncStatus ?? undefined,
		lastSyncAt: existing?.lastSyncAt ?? undefined,
		syncEnabled: connectorKey !== "external_calendars" && hasConnectionMaterial,
		syncIntervalMinutes: Number(existing?.syncIntervalMinutes ?? 1440),
		nextSyncAt:
			connectorKey !== "external_calendars" && hasConnectionMaterial
				? (existing?.nextSyncAt ?? now)
				: null,
		consecutiveFailures: 0,
		updatedAt: now,
	}

	if (existing?.id) {
		const before = connectionAuditSnapshot(existing)
		await db
			.update(ProviderIntegrationConnection)
			.set(values)
			.where(eq(ProviderIntegrationConnection.id, existing.id))
		if (params.oauthCredential?.accessToken) {
			await upsertProviderIntegrationOAuthCredential({
				providerId: params.providerId,
				connectionId: existing.id,
				connectorKey,
				credential: params.oauthCredential,
			})
		} else if (credentialSecret) {
			await upsertProviderIntegrationOpaqueCredential({
				providerId: params.providerId,
				connectionId: existing.id,
				connectorKey,
				authType,
				secret: credentialSecret,
			})
		}
		await insertAudit({
			providerId: params.providerId,
			actorUserId: params.currentUserId,
			action: "provider.integration.update",
			entityId: existing.id,
			beforeJson: before,
			afterJson: connectionAuditSnapshot({
				id: existing.id,
				...values,
				hasCredential,
			}),
			riskLevel: inferSettingsRiskLevel({
				domain: "integrations",
				changedKeys: ["status", "mode", "endpointUrl", "credential", "scopes"],
			}),
		})
		await invalidateProviderGovernance(params.providerId, "provider_integration_updated")
		return existing.id
	}

	const id = crypto.randomUUID()
	await db.insert(ProviderIntegrationConnection).values({
		id,
		...values,
		isPrimary: connectorConnections.length === 0,
		createdAt: now,
	})
	if (params.oauthCredential?.accessToken) {
		await upsertProviderIntegrationOAuthCredential({
			providerId: params.providerId,
			connectionId: id,
			connectorKey,
			credential: params.oauthCredential,
		})
	} else if (credentialSecret) {
		await upsertProviderIntegrationOpaqueCredential({
			providerId: params.providerId,
			connectionId: id,
			connectorKey,
			authType,
			secret: credentialSecret,
		})
	}
	await insertAudit({
		providerId: params.providerId,
		actorUserId: params.currentUserId,
		action: "provider.integration.connect",
		entityId: id,
		beforeJson: null,
		afterJson: connectionAuditSnapshot({ id, ...values, hasCredential }),
		riskLevel: inferSettingsRiskLevel({
			domain: "integrations",
			changedKeys: ["status", "mode", "endpointUrl", "credential", "scopes"],
		}),
	})
	await invalidateProviderGovernance(params.providerId, "provider_integration_connected")
	return id
}

export async function revokeProviderIntegration(params: {
	providerId: string
	currentUserId?: string | null
	connectorKey: string
	connectionId?: string | null
}) {
	const connectorKey = normalizeConnectorKey(params.connectorKey)
	const candidates = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, connectorKey)
			)
		)
	const existing = params.connectionId
		? candidates.find((row) => row.id === params.connectionId)
		: (candidates.find((row) => row.isPrimary) ?? candidates[0])
	if (!existing?.id) return null

	const before = connectionAuditSnapshot(existing)
	const after = {
		...before,
		status: "revoked",
		endpointUrl: null,
		hasCredential: false,
		errorMessage: "Credenciales revocadas por el proveedor.",
	}

	await db.transaction(async (tx) => {
		await tx
			.update(ProviderIntegrationConnection)
			.set({
				status: "revoked",
				isPrimary: false,
				endpointUrl: null,
				errorMessage: "Credenciales revocadas por el proveedor.",
				updatedAt: new Date(),
			})
			.where(eq(ProviderIntegrationConnection.id, existing.id))
		await tx
			.update(ProviderIntegrationCredential)
			.set({ revokedAt: new Date(), updatedAt: new Date() })
			.where(eq(ProviderIntegrationCredential.connectionId, existing.id))
		await tx
			.update(ProviderIntegrationMapping)
			.set({ status: "inactive", updatedAt: new Date() })
			.where(eq(ProviderIntegrationMapping.connectionId, existing.id))
		if (existing.isPrimary) {
			const replacement = candidates.find(
				(row) => row.id !== existing.id && row.status !== "revoked"
			)
			if (replacement) {
				await tx
					.update(ProviderIntegrationConnection)
					.set({ isPrimary: true, updatedAt: new Date() })
					.where(eq(ProviderIntegrationConnection.id, replacement.id))
			}
		}
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
	connectionId?: string | null
	trigger?: "manual" | "scheduled" | "webhook" | "retry"
	idempotencyKey?: string | null
}) {
	const connectorKey = normalizeConnectorKey(params.connectorKey)
	const candidates = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, connectorKey)
			)
		)
	const existing = params.connectionId
		? candidates.find((row) => row.id === params.connectionId)
		: (candidates.find((row) => row.isPrimary) ?? candidates[0])
	if (!existing?.id) throw new Error("CONNECTION_NOT_FOUND")

	const {
		finishProviderIntegrationSyncRun,
		recordProviderIntegrationIncident,
		resolveProviderIntegrationIncidentByKey,
		startProviderIntegrationSyncRun,
	} = await import("@/lib/provider-integration-operations")
	const run = await startProviderIntegrationSyncRun({
		providerId: params.providerId,
		connectionId: existing.id,
		operation: "connection_test",
		trigger: params.trigger ?? "manual",
		requestedBy: params.currentUserId,
		idempotencyKey: params.idempotencyKey,
	})
	const credentialState = await ensureProviderIntegrationCredentialFresh({
		providerId: params.providerId,
		connectionId: existing.id,
		connectorKey,
		actorUserId: params.currentUserId,
		authType: normalizeChannelManagerAuthType(existing.authType),
		mode: normalizeMode(existing.mode),
	})
	const { runConnectorSmokeTest } = await import("@/lib/provider-connector-smoke")
	const { runChannelManagerVendorSmokeTest } = await import("@/lib/provider-channel-manager-smoke")
	const vendorSmoke =
		connectorKey === "channel_manager"
			? await runChannelManagerVendorSmokeTest({
					vendorKey: normalizeChannelManagerVendorKey(existing.vendorKey),
					authType: normalizeChannelManagerAuthType(existing.authType),
					credentialSecret: credentialState.credentialSecret,
					externalPropertyId: existing.externalPropertyId,
				})
			: null
	const smoke = credentialState.error
		? {
				ok: false,
				message: credentialState.error,
				latencyMs: 0,
				probe: "oauth2" as const,
				trustLevel: "failed" as const,
			}
		: vendorSmoke
			? vendorSmoke
			: credentialState.oauthVaultVerified
				? {
						ok: true,
						message: credentialState.refreshed
							? "Token OAuth renovado y credencial activa."
							: "Credencial OAuth activa en vault.",
						latencyMs: 0,
						probe: "oauth2" as const,
						trustLevel: "verified_connection" as const,
					}
				: await runConnectorSmokeTest({
						connectorKey,
						endpointUrl: String(existing.endpointUrl ?? ""),
						mode: String(existing.mode ?? "sandbox"),
					})
	const hasVerifiedConnection = smoke.ok && smoke.trustLevel === "verified_connection"
	const status: ProviderConnectorStatus = hasVerifiedConnection
		? "connected"
		: smoke.ok
			? "pending"
			: "error"
	const message = smoke.message
	const before = connectionAuditSnapshot(existing)
	const now = new Date()
	const nextSyncAt = new Date(
		now.getTime() + Math.max(15, Number(existing.syncIntervalMinutes ?? 1440)) * 60_000
	)
	await db
		.update(ProviderIntegrationConnection)
		.set({
			status,
			lastSyncAt: now,
			lastSyncStatus: hasVerifiedConnection ? "success" : smoke.ok ? "reference_valid" : "error",
			errorMessage: hasVerifiedConnection
				? null
				: smoke.ok
					? "La referencia es válida, pero falta una prueba real del proveedor antes de usarla como conexión activa."
					: message,
			nextSyncAt: hasVerifiedConnection ? nextSyncAt : existing.nextSyncAt,
			lastAutomaticSyncAt:
				params.trigger === "scheduled" || params.trigger === "retry"
					? now
					: existing.lastAutomaticSyncAt,
			consecutiveFailures: hasVerifiedConnection ? 0 : Number(existing.consecutiveFailures ?? 0),
			lastCatalogSyncAt:
				hasVerifiedConnection && connectorKey === "channel_manager"
					? now
					: existing.lastCatalogSyncAt,
			// Smoke/preview cache only — never treat as mapping/catalog SoT (Phase 6).
			catalogJson:
				hasVerifiedConnection && connectorKey === "channel_manager"
					? buildChannelManagerCatalogCache({
							vendorKey: existing.vendorKey,
							authType: existing.authType,
							externalPropertyId: existing.externalPropertyId,
							lastSmokeProbe: smoke.probe,
							lastSmokeMessage: message,
						})
					: existing.catalogJson,
			updatedAt: now,
		})
		.where(eq(ProviderIntegrationConnection.id, existing.id))
	await insertAudit({
		providerId: params.providerId,
		actorUserId: params.currentUserId,
		action: "provider.integration.sync_test",
		entityId: existing.id,
		beforeJson: before,
		afterJson: connectionAuditSnapshot({
			...existing,
			status,
			lastSyncStatus: hasVerifiedConnection ? "success" : smoke.ok ? "reference_valid" : "error",
			errorMessage: hasVerifiedConnection
				? null
				: smoke.ok
					? "La referencia es válida, pero falta una prueba real del proveedor antes de usarla como conexión activa."
					: message,
		}),
		riskLevel: "medium",
	})
	await finishProviderIntegrationSyncRun({
		providerId: params.providerId,
		runId: run.id,
		status: hasVerifiedConnection ? "succeeded" : "failed",
		readCount: 1,
		changedCount: hasVerifiedConnection ? 1 : 0,
		failedCount: hasVerifiedConnection ? 0 : 1,
		errorCode: hasVerifiedConnection ? null : "CONNECTION_TEST_FAILED",
		errorMessage: hasVerifiedConnection ? null : message,
		summaryJson: {
			probe: smoke.probe,
			trustLevel: smoke.trustLevel,
			latencyMs: smoke.latencyMs,
		},
	})
	if (hasVerifiedConnection) {
		await resolveProviderIntegrationIncidentByKey({
			providerId: params.providerId,
			connectionId: existing.id,
			dedupeKey: "connection_test_failed",
			resolvedBy: params.currentUserId,
			resolutionNote: "La prueba de conexión volvió a responder correctamente.",
		})
	} else {
		await recordProviderIntegrationIncident({
			providerId: params.providerId,
			connectionId: existing.id,
			syncRunId: run.id,
			input: {
				dedupeKey: "connection_test_failed",
				code: "CONNECTION_TEST_FAILED",
				category: "authentication",
				severity: "error",
				title: "La conexión no respondió correctamente",
				description:
					"Revisa las credenciales o el acceso del proveedor y vuelve a probar esta conexión.",
				actionLabel: "Revisar conexión",
				actionHref: "/provider/settings/integrations?mode=pro",
			},
		})
	}
	await invalidateProviderGovernance(params.providerId, "provider_integration_sync_tested")
	return { status, message, smoke }
}

export async function listProviderChannelManagerRemoteProperties(params: {
	providerId: string
	currentUserId?: string | null
	connectionId: string
}): Promise<RemoteChannelManagerPropertyResult> {
	const connection = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.id, params.connectionId),
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, "channel_manager")
			)
		)
		.then((rows) => rows[0])
	if (!connection || connection.status === "revoked") {
		throw new Error("INTEGRATION_CONNECTION_NOT_FOUND")
	}
	const vendorKey = normalizeChannelManagerVendorKey(connection.vendorKey)
	if (vendorKey === "generic") throw new Error("REMOTE_PROPERTIES_VENDOR_UNSUPPORTED")

	const credential = await ensureProviderIntegrationCredentialFresh({
		providerId: params.providerId,
		connectionId: connection.id,
		connectorKey: "channel_manager",
		actorUserId: params.currentUserId,
		authType: normalizeChannelManagerAuthType(connection.authType),
		mode: normalizeMode(connection.mode),
	})
	if (credential.error) throw new Error(credential.error)

	return fetchChannelManagerRemoteProperties({
		vendorKey,
		authType: normalizeChannelManagerAuthType(connection.authType),
		credentialSecret: credential.credentialSecret,
		mode: normalizeMode(connection.mode),
	})
}

export async function getProviderChannelManagerRemoteCatalog(params: {
	providerId: string
	currentUserId?: string | null
	connectionId: string
}): Promise<RemoteChannelManagerCatalogResult> {
	const connection = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.id, params.connectionId),
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.connectorKey, "channel_manager")
			)
		)
		.then((rows) => rows[0])
	if (!connection || connection.status === "revoked") {
		throw new Error("INTEGRATION_CONNECTION_NOT_FOUND")
	}
	const propertyId = String(connection.externalPropertyId ?? "").trim()
	if (!propertyId) throw new Error("REMOTE_CATALOG_PROPERTY_REQUIRED")
	const vendorKey = normalizeChannelManagerVendorKey(connection.vendorKey)
	if (vendorKey === "generic") throw new Error("REMOTE_CATALOG_VENDOR_UNSUPPORTED")

	const credential = await ensureProviderIntegrationCredentialFresh({
		providerId: params.providerId,
		connectionId: connection.id,
		connectorKey: "channel_manager",
		actorUserId: params.currentUserId,
		authType: normalizeChannelManagerAuthType(connection.authType),
		mode: normalizeMode(connection.mode),
	})
	if (credential.error) throw new Error(credential.error)

	return fetchChannelManagerRemoteCatalog({
		vendorKey,
		authType: normalizeChannelManagerAuthType(connection.authType),
		credentialSecret: credential.credentialSecret,
		mode: normalizeMode(connection.mode),
		propertyId,
	})
}

function credentialsExpiresAt(expiresIn?: number | null, now = new Date()): Date | null {
	if (!expiresIn || expiresIn <= 0) return null
	return new Date(now.getTime() + expiresIn * 1000)
}

function refreshAfter(expiresAt: Date | null): Date | null {
	if (!expiresAt) return null
	return new Date(Math.max(Date.now(), expiresAt.getTime() - 5 * 60 * 1000))
}

async function upsertProviderIntegrationOAuthCredential(params: {
	providerId: string
	connectionId: string
	connectorKey: ProviderConnectorKey
	credential: {
		accessToken: string
		refreshToken?: string | null
		tokenType?: string | null
		expiresIn?: number | null
		scope?: string | null
	}
	refreshed?: boolean
}) {
	const now = new Date()
	const expiresAt = credentialsExpiresAt(params.credential.expiresIn, now)
	const payload: ProviderIntegrationVaultPayload = {
		v: 1,
		authType: "oauth2",
		tokenType: String(params.credential.tokenType || "bearer"),
		accessToken: params.credential.accessToken,
		refreshToken: params.credential.refreshToken ?? null,
		scope: params.credential.scope ?? null,
		obtainedAt: now.toISOString(),
		expiresAt: expiresAt?.toISOString() ?? null,
		vendor: params.connectorKey,
	}
	const encryptedJson = encryptProviderIntegrationSecret({
		providerId: params.providerId,
		connectionId: params.connectionId,
		payload,
	})
	const scopes = params.credential.scope?.split(/\s+/).filter(Boolean) ?? []
	const existing = await db
		.select()
		.from(ProviderIntegrationCredential)
		.where(eq(ProviderIntegrationCredential.connectionId, params.connectionId))
		.then((rows) => rows[0])
		.catch(() => null)
	const values = {
		providerId: params.providerId,
		authType: "oauth2",
		encryptedJson,
		scopesJson: scopes,
		tokenExpiresAt: expiresAt ?? undefined,
		refreshAfterAt: refreshAfter(expiresAt) ?? undefined,
		lastRefreshedAt: params.refreshed ? now : (existing?.lastRefreshedAt ?? undefined),
		revokedAt: null,
		updatedAt: now,
	}
	if (existing) {
		await db
			.update(ProviderIntegrationCredential)
			.set(values)
			.where(eq(ProviderIntegrationCredential.connectionId, params.connectionId))
		return
	}
	await db.insert(ProviderIntegrationCredential).values({
		connectionId: params.connectionId,
		...values,
		createdAt: now,
	})
}

async function upsertProviderIntegrationOpaqueCredential(params: {
	providerId: string
	connectionId: string
	connectorKey: ProviderConnectorKey
	authType: ChannelManagerAuthType
	secret: string
}) {
	if (params.authType === "oauth2") {
		throw new Error("INTEGRATION_OAUTH_REQUIRES_AUTHORIZATION_FLOW")
	}
	const now = new Date()
	const encryptedJson = encryptProviderIntegrationSecret({
		providerId: params.providerId,
		connectionId: params.connectionId,
		payload: {
			v: 1,
			authType: params.authType,
			secret: params.secret,
			obtainedAt: now.toISOString(),
			vendor: params.connectorKey,
		},
	})
	const values = {
		providerId: params.providerId,
		authType: params.authType,
		encryptedJson,
		scopesJson: [],
		tokenExpiresAt: null,
		refreshAfterAt: null,
		lastRefreshedAt: null,
		revokedAt: null,
		updatedAt: now,
	}
	const existing = await db
		.select({ connectionId: ProviderIntegrationCredential.connectionId })
		.from(ProviderIntegrationCredential)
		.where(eq(ProviderIntegrationCredential.connectionId, params.connectionId))
		.then((rows) => rows[0])
		.catch(() => null)
	if (existing) {
		await db
			.update(ProviderIntegrationCredential)
			.set(values)
			.where(eq(ProviderIntegrationCredential.connectionId, params.connectionId))
		return
	}
	await db.insert(ProviderIntegrationCredential).values({
		connectionId: params.connectionId,
		...values,
		createdAt: now,
	})
}

async function ensureProviderIntegrationCredentialFresh(params: {
	providerId: string
	connectionId: string
	connectorKey: ProviderConnectorKey
	actorUserId?: string | null
	authType: ChannelManagerAuthType
	mode: ProviderConnectorMode
}): Promise<{
	credentialSecret: string
	oauthVaultVerified: boolean
	refreshed: boolean
	error: string | null
}> {
	const row = await db
		.select()
		.from(ProviderIntegrationCredential)
		.where(eq(ProviderIntegrationCredential.connectionId, params.connectionId))
		.then((rows) => rows[0])
		.catch(() => null)
	if (!row || row.revokedAt) {
		if (params.authType !== "oauth2") {
			return {
				credentialSecret: "",
				oauthVaultVerified: false,
				refreshed: false,
				error: null,
			}
		}
		return {
			credentialSecret: "",
			oauthVaultVerified: false,
			refreshed: false,
			error: "No encontramos una credencial OAuth activa para esta conexión.",
		}
	}
	let payload: ProviderIntegrationVaultPayload
	try {
		payload = decryptProviderIntegrationSecret({
			providerId: params.providerId,
			connectionId: params.connectionId,
			authType: row.authType,
			encrypted: row.encryptedJson,
		})
	} catch (error) {
		return {
			credentialSecret: "",
			oauthVaultVerified: false,
			refreshed: false,
			error: error instanceof Error ? error.message : "INTEGRATION_VAULT_DECRYPT_FAILED",
		}
	}
	if (payload.authType !== "oauth2") {
		return {
			credentialSecret: payload.secret,
			oauthVaultVerified: false,
			refreshed: false,
			error: null,
		}
	}
	const expiresAt = row.tokenExpiresAt ?? payload.expiresAt ?? null
	if (!shouldRefreshProviderIntegrationToken(expiresAt)) {
		return {
			credentialSecret: payload.accessToken,
			oauthVaultVerified: true,
			refreshed: false,
			error: null,
		}
	}
	if (!payload.refreshToken) {
		return {
			credentialSecret: "",
			oauthVaultVerified: false,
			refreshed: false,
			error: isProviderIntegrationTokenExpired(expiresAt)
				? "La autorización OAuth expiró. Conecta de nuevo para renovar el acceso."
				: "La autorización OAuth está por expirar y el proveedor no entregó refresh token.",
		}
	}
	const refreshed = await refreshConnectorOAuthToken({
		refreshToken: payload.refreshToken,
		connectorKey: params.connectorKey,
	})
	if (!refreshed.ok || !refreshed.accessToken) {
		return {
			credentialSecret: "",
			oauthVaultVerified: false,
			refreshed: false,
			error: refreshed.message ?? refreshed.error ?? "No se pudo renovar la autorización OAuth.",
		}
	}
	await upsertProviderIntegrationOAuthCredential({
		providerId: params.providerId,
		connectionId: params.connectionId,
		connectorKey: params.connectorKey,
		credential: {
			accessToken: refreshed.accessToken,
			refreshToken: refreshed.refreshToken ?? payload.refreshToken,
			tokenType: refreshed.tokenType,
			expiresIn: refreshed.expiresIn,
			scope: refreshed.scope ?? payload.scope,
		},
		refreshed: true,
	})
	await insertAudit({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.integration.credential_refresh",
		entityId: params.connectionId,
		beforeJson: { authType: "oauth2", tokenExpiresAt: expiresAt },
		afterJson: {
			authType: "oauth2",
			tokenExpiresAt: credentialsExpiresAt(refreshed.expiresIn),
		},
		riskLevel: "medium",
	})
	return {
		credentialSecret: refreshed.accessToken,
		oauthVaultVerified: true,
		refreshed: true,
		error: null,
	}
}
