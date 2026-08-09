import {
	and,
	db,
	desc,
	eq,
	first,
	inArray,
	ProviderIntegrationConnection,
	ProviderIntegrationCredential,
	ProviderIntegrationIncident,
	ProviderIntegrationMapping,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
	Product,
	ProductStatus,
	RatePlan,
	sql,
	TaxFeeDefinition,
	Variant,
} from "@/shared/infrastructure/db/compat"
import { assertProviderIntegrationCertificationRunLink } from "@/lib/provider-integration-certification"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { invalidateProviderIntegrations } from "@/lib/cache/invalidation"
import { readThrough } from "@/lib/cache/readThrough"

export type IntegrationMappingInput = {
	mappingType: string
	localEntityType: string
	localEntityId: string
	externalEntityType: string
	externalEntityId: string
	externalEntityName?: string | null
	direction?: "import" | "export" | "bidirectional"
	metadataJson?: unknown
}

export type IntegrationRunStatus = "running" | "succeeded" | "partial" | "failed" | "cancelled"

/** Connector/ops failure classes. Inventory overlaps use ProviderExternalCalendarConflict. */
export type IntegrationIncidentCategory =
	| "authentication"
	| "mapping"
	| "remote_api"
	| "data_quality"
	| "system"

export type IntegrationIncidentInput = {
	dedupeKey: string
	code: string
	category: IntegrationIncidentCategory
	severity: "info" | "warning" | "error" | "critical"
	title: string
	description: string
	actionLabel?: string | null
	actionHref?: string | null
	entityType?: string | null
	entityId?: string | null
	mappingId?: string | null
	metadataJson?: unknown
}

export type ProviderIntegrationMappingCatalog = {
	products: Array<{ id: string; label: string; entityType: "product" }>
	variants: Array<{
		id: string
		label: string
		name: string
		entityType: "variant"
		productId: string
		productName: string
		productPublished: boolean
		sellable: boolean
		/**
		 * Derived only for an authenticated certification context. It is deliberately
		 * not persisted: certification eligibility must never make inventory public.
		 */
		certificationEligible?: boolean
	}>
	ratePlans: Array<{
		id: string
		label: string
		name: string
		entityType: "rate_plan"
		variantId: string
		variantName: string
		isDefault: boolean
		productPublished: boolean
		sellable: boolean
		certificationEligible?: boolean
	}>
	taxes: Array<{ id: string; label: string; entityType: "tax" }>
}

const ALLOWED_MAPPING_TYPES = new Set([
	"property",
	"room_type",
	"rate_plan",
	"tax",
	"account",
	"calendar",
])
const ALLOWED_ENTITY_TYPES = new Set([
	"provider",
	"product",
	"variant",
	"rate_plan",
	"tax",
	"account",
	"calendar",
])
const WORKSPACE_CONNECTOR_KEYS = ["channel_manager", "external_calendars"] as const

function requiredIdentifier(value: unknown, code: string, max = 200): string {
	const normalized = String(value ?? "").trim()
	if (!normalized || normalized.length > max) throw new Error(code)
	return normalized
}

function normalizeActionHref(value: unknown): string | null {
	const href = String(value ?? "").trim()
	if (!href) return null
	if (!href.startsWith("/provider/settings/integrations")) return null
	return href.slice(0, 500)
}

async function ownedConnection(providerId: string, connectionId: string) {
	const connection = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.id, connectionId),
				eq(ProviderIntegrationConnection.providerId, providerId)
			)
		)
		.then(first)
	if (!connection) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND")
	return connection
}

export async function setPrimaryProviderIntegrationConnection(params: {
	providerId: string
	connectionId: string
}) {
	const connection = await ownedConnection(params.providerId, params.connectionId)
	if (connection.status === "revoked") throw new Error("INTEGRATION_CONNECTION_REVOKED")
	await db.transaction(async (tx) => {
		await tx
			.update(ProviderIntegrationConnection)
			.set({ isPrimary: false, updatedAt: new Date() })
			.where(
				and(
					eq(ProviderIntegrationConnection.providerId, params.providerId),
					eq(ProviderIntegrationConnection.connectorKey, connection.connectorKey)
				)
			)
		await tx
			.update(ProviderIntegrationConnection)
			.set({ isPrimary: true, updatedAt: new Date() })
			.where(eq(ProviderIntegrationConnection.id, params.connectionId))
	})
	await invalidateProviderIntegrations(params.providerId, "provider_integration_primary_changed")
}

export async function upsertProviderIntegrationMapping(params: {
	providerId: string
	connectionId: string
	input: IntegrationMappingInput
}) {
	const ids = await upsertProviderIntegrationMappings({
		providerId: params.providerId,
		connectionId: params.connectionId,
		inputs: [params.input],
	})
	return ids[0]
}

function normalizeMappingInput(input: IntegrationMappingInput) {
	const mappingType = requiredIdentifier(input.mappingType, "MAPPING_TYPE_REQUIRED", 60)
	const localEntityType = requiredIdentifier(
		input.localEntityType,
		"MAPPING_LOCAL_TYPE_REQUIRED",
		60
	)
	if (!ALLOWED_MAPPING_TYPES.has(mappingType)) throw new Error("MAPPING_TYPE_INVALID")
	if (!ALLOWED_ENTITY_TYPES.has(localEntityType)) throw new Error("MAPPING_LOCAL_TYPE_INVALID")
	const localEntityId = requiredIdentifier(input.localEntityId, "MAPPING_LOCAL_ID_REQUIRED")
	const externalEntityType = requiredIdentifier(
		input.externalEntityType,
		"MAPPING_EXTERNAL_TYPE_REQUIRED",
		60
	)
	const externalEntityId = requiredIdentifier(
		input.externalEntityId,
		"MAPPING_EXTERNAL_ID_REQUIRED"
	)
	const direction =
		input.direction === "import" || input.direction === "export" ? input.direction : "bidirectional"
	return {
		mappingType,
		localEntityType,
		localEntityId,
		externalEntityType,
		externalEntityId,
		externalEntityName: String(input.externalEntityName ?? "").trim() || null,
		direction,
		metadataJson: input.metadataJson ?? null,
	}
}

export async function upsertProviderIntegrationMappings(params: {
	providerId: string
	connectionId: string
	inputs: IntegrationMappingInput[]
}) {
	await ownedConnection(params.providerId, params.connectionId)
	if (!params.inputs.length || params.inputs.length > 250) {
		throw new Error("MAPPING_BATCH_SIZE_INVALID")
	}
	const normalized = params.inputs.map(normalizeMappingInput)
	const localKeys = new Set<string>()
	const externalKeys = new Set<string>()
	for (const input of normalized) {
		const localKey = `${input.mappingType}:${input.localEntityId}`
		const externalKey = `${input.mappingType}:${input.externalEntityId}`
		if (localKeys.has(localKey)) throw new Error("MAPPING_LOCAL_DUPLICATED")
		if (externalKeys.has(externalKey)) throw new Error("MAPPING_EXTERNAL_DUPLICATED")
		localKeys.add(localKey)
		externalKeys.add(externalKey)
	}

	const existingMappings = await db
		.select()
		.from(ProviderIntegrationMapping)
		.where(eq(ProviderIntegrationMapping.connectionId, params.connectionId))
	const replacedLocalKeys = new Set(localKeys)
	for (const mapping of existingMappings) {
		const localKey = `${mapping.mappingType}:${mapping.localEntityId}`
		if (replacedLocalKeys.has(localKey)) continue
		const externalKey = `${mapping.mappingType}:${mapping.externalEntityId}`
		if (externalKeys.has(externalKey)) throw new Error("MAPPING_EXTERNAL_ALREADY_ASSIGNED")
	}

	const now = new Date()
	const ids = await db.transaction(async (tx) => {
		const ids: string[] = []
		for (const input of normalized) {
			const existing = existingMappings.find(
				(mapping) =>
					mapping.mappingType === input.mappingType && mapping.localEntityId === input.localEntityId
			)
			const values = {
				providerId: params.providerId,
				connectionId: params.connectionId,
				...input,
				status: "active",
				lastVerifiedAt: now,
				updatedAt: now,
			}
			if (existing) {
				await tx
					.update(ProviderIntegrationMapping)
					.set(values)
					.where(eq(ProviderIntegrationMapping.id, existing.id))
				ids.push(existing.id)
				continue
			}
			const id = crypto.randomUUID()
			await tx.insert(ProviderIntegrationMapping).values({ id, ...values, createdAt: now })
			ids.push(id)
		}
		return ids
	})
	await invalidateProviderIntegrations(
		params.providerId,
		"provider_integration_mappings_upserted"
	).catch(() => {})
	return ids
}

export async function removeProviderIntegrationMapping(params: {
	providerId: string
	connectionId: string
	mappingId: string
}) {
	await ownedConnection(params.providerId, params.connectionId)
	const mapping = await db
		.select({ id: ProviderIntegrationMapping.id })
		.from(ProviderIntegrationMapping)
		.where(
			and(
				eq(ProviderIntegrationMapping.id, params.mappingId),
				eq(ProviderIntegrationMapping.connectionId, params.connectionId),
				eq(ProviderIntegrationMapping.providerId, params.providerId)
			)
		)
		.then(first)
	if (!mapping) throw new Error("INTEGRATION_MAPPING_NOT_FOUND")
	await db
		.delete(ProviderIntegrationMapping)
		.where(eq(ProviderIntegrationMapping.id, params.mappingId))
	await invalidateProviderIntegrations(params.providerId, "provider_integration_mapping_removed")
}

export async function startProviderIntegrationSyncRun(params: {
	providerId: string
	connectionId: string
	certificationId?: string | null
	operation: string
	trigger?: "manual" | "scheduled" | "webhook" | "retry"
	requestedBy?: string | null
	idempotencyKey?: string | null
}) {
	const connection = await ownedConnection(params.providerId, params.connectionId)
	if (params.certificationId) {
		await assertProviderIntegrationCertificationRunLink({
			providerId: params.providerId,
			connectionId: params.connectionId,
			certificationId: params.certificationId,
		})
	}
	const idempotencyKey = String(params.idempotencyKey ?? "").trim() || null
	if (idempotencyKey) {
		const existing = await db
			.select()
			.from(ProviderIntegrationSyncRun)
			.where(
				and(
					eq(ProviderIntegrationSyncRun.connectionId, params.connectionId),
					eq(ProviderIntegrationSyncRun.idempotencyKey, idempotencyKey)
				)
			)
			.then(first)
		if (existing) return existing
	}
	const now = new Date()
	const run = {
		id: crypto.randomUUID(),
		providerId: params.providerId,
		connectionId: params.connectionId,
		certificationId: params.certificationId ?? null,
		connectorKey: String(connection.connectorKey),
		operation: requiredIdentifier(params.operation, "SYNC_OPERATION_REQUIRED", 80),
		trigger: params.trigger ?? "manual",
		status: "running",
		idempotencyKey,
		requestedBy: params.requestedBy ?? null,
		startedAt: now,
		createdAt: now,
	}
	await db.insert(ProviderIntegrationSyncRun).values(run)
	return run
}

export async function finishProviderIntegrationSyncRun(params: {
	providerId: string
	runId: string
	status: Exclude<IntegrationRunStatus, "running">
	readCount?: number
	changedCount?: number
	skippedCount?: number
	failedCount?: number
	cursor?: string | null
	errorCode?: string | null
	errorMessage?: string | null
	summaryJson?: unknown
}) {
	const run = await db
		.select()
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.id, params.runId),
				eq(ProviderIntegrationSyncRun.providerId, params.providerId)
			)
		)
		.then(first)
	if (!run) throw new Error("INTEGRATION_SYNC_RUN_NOT_FOUND")
	if (run.status !== "running") return run
	const finishedAt = new Date()
	await db
		.update(ProviderIntegrationSyncRun)
		.set({
			status: params.status,
			readCount: Math.max(0, params.readCount ?? 0),
			changedCount: Math.max(0, params.changedCount ?? 0),
			skippedCount: Math.max(0, params.skippedCount ?? 0),
			failedCount: Math.max(0, params.failedCount ?? 0),
			cursor: params.cursor ?? null,
			errorCode: params.errorCode ?? null,
			errorMessage: params.errorMessage ? String(params.errorMessage).slice(0, 1000) : null,
			summaryJson: params.summaryJson ?? null,
			finishedAt,
		})
		.where(eq(ProviderIntegrationSyncRun.id, params.runId))
	return { ...run, ...params, finishedAt }
}

export async function recordProviderIntegrationIncident(params: {
	providerId: string
	connectionId: string
	syncRunId?: string | null
	input: IntegrationIncidentInput
}) {
	await ownedConnection(params.providerId, params.connectionId)
	const dedupeKey = requiredIdentifier(params.input.dedupeKey, "INCIDENT_DEDUPE_KEY_REQUIRED")
	const now = new Date()
	const existing = await db
		.select()
		.from(ProviderIntegrationIncident)
		.where(
			and(
				eq(ProviderIntegrationIncident.connectionId, params.connectionId),
				eq(ProviderIntegrationIncident.dedupeKey, dedupeKey)
			)
		)
		.then(first)
	const values = {
		syncRunId: params.syncRunId ?? null,
		mappingId: params.input.mappingId ?? null,
		code: requiredIdentifier(params.input.code, "INCIDENT_CODE_REQUIRED", 100),
		category: params.input.category,
		severity: params.input.severity,
		status: "open",
		title: requiredIdentifier(params.input.title, "INCIDENT_TITLE_REQUIRED", 180),
		description: requiredIdentifier(
			params.input.description,
			"INCIDENT_DESCRIPTION_REQUIRED",
			1000
		),
		actionLabel:
			String(params.input.actionLabel ?? "")
				.trim()
				.slice(0, 100) || null,
		actionHref: normalizeActionHref(params.input.actionHref),
		entityType:
			String(params.input.entityType ?? "")
				.trim()
				.slice(0, 80) || null,
		entityId:
			String(params.input.entityId ?? "")
				.trim()
				.slice(0, 200) || null,
		metadataJson: params.input.metadataJson ?? null,
		lastSeenAt: now,
		resolvedAt: null,
		resolvedBy: null,
		resolutionNote: null,
		updatedAt: now,
	}
	let incidentId: string
	let forceNotify = false
	if (existing) {
		await db
			.update(ProviderIntegrationIncident)
			.set({
				...values,
				notificationStatus:
					existing.status === "resolved" ? "pending" : existing.notificationStatus,
				notificationError: existing.status === "resolved" ? null : existing.notificationError,
				occurrenceCount: sql`${ProviderIntegrationIncident.occurrenceCount} + 1`,
			})
			.where(eq(ProviderIntegrationIncident.id, existing.id))
		incidentId = existing.id
		forceNotify = existing.status === "resolved"
	} else {
		incidentId = crypto.randomUUID()
		await db.insert(ProviderIntegrationIncident).values({
			id: incidentId,
			providerId: params.providerId,
			connectionId: params.connectionId,
			dedupeKey,
			occurrenceCount: 1,
			firstSeenAt: now,
			createdAt: now,
			notificationStatus: "pending",
			notificationError: null,
			...values,
		})
		forceNotify = true
	}
	const { notifyProviderIntegrationIncident } =
		await import("@/lib/provider-integration-incident-notifications")
	await notifyProviderIntegrationIncident({
		incidentId,
		force: forceNotify || params.input.severity === "critical",
	}).catch(() => null)
	await invalidateProviderIntegrations(
		params.providerId,
		"provider_integration_incident_recorded"
	).catch(() => {})
	return incidentId
}

export async function resolveProviderIntegrationIncident(params: {
	providerId: string
	incidentId: string
	resolvedBy?: string | null
	resolutionNote?: string | null
}) {
	const incident = await db
		.select()
		.from(ProviderIntegrationIncident)
		.where(
			and(
				eq(ProviderIntegrationIncident.id, params.incidentId),
				eq(ProviderIntegrationIncident.providerId, params.providerId)
			)
		)
		.then(first)
	if (!incident) throw new Error("INTEGRATION_INCIDENT_NOT_FOUND")
	await db
		.update(ProviderIntegrationIncident)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolvedBy: params.resolvedBy ?? null,
			resolutionNote:
				String(params.resolutionNote ?? "")
					.trim()
					.slice(0, 500) || null,
			updatedAt: new Date(),
		})
		.where(eq(ProviderIntegrationIncident.id, params.incidentId))
	await invalidateProviderIntegrations(
		params.providerId,
		"provider_integration_incident_resolved"
	).catch(() => {})
}

export async function resolveProviderIntegrationIncidentByKey(params: {
	providerId: string
	connectionId: string
	dedupeKey: string
	resolvedBy?: string | null
	resolutionNote?: string | null
}) {
	await db
		.update(ProviderIntegrationIncident)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolvedBy: params.resolvedBy ?? null,
			resolutionNote:
				String(params.resolutionNote ?? "")
					.trim()
					.slice(0, 500) || null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(ProviderIntegrationIncident.providerId, params.providerId),
				eq(ProviderIntegrationIncident.connectionId, params.connectionId),
				eq(ProviderIntegrationIncident.dedupeKey, params.dedupeKey),
				eq(ProviderIntegrationIncident.status, "open")
			)
		)
	await invalidateProviderIntegrations(
		params.providerId,
		"provider_integration_incident_resolved_by_key"
	).catch(() => {})
}

export async function resolveProviderIntegrationIncidentsForEntity(params: {
	providerId: string
	connectionId: string
	entityType: string
	entityId: string
	resolutionNote?: string | null
}) {
	await ownedConnection(params.providerId, params.connectionId)
	await db
		.update(ProviderIntegrationIncident)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolutionNote: params.resolutionNote?.slice(0, 500) ?? null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(ProviderIntegrationIncident.providerId, params.providerId),
				eq(ProviderIntegrationIncident.connectionId, params.connectionId),
				eq(ProviderIntegrationIncident.entityType, params.entityType),
				eq(ProviderIntegrationIncident.entityId, params.entityId),
				eq(ProviderIntegrationIncident.status, "open")
			)
		)
}

export async function listProviderIntegrationOperations(providerId: string) {
	const [connections, mappings, runs, jobs, incidents] = await Promise.all([
		db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId))
			.orderBy(
				desc(ProviderIntegrationConnection.isPrimary),
				desc(ProviderIntegrationConnection.updatedAt)
			),
		db
			.select()
			.from(ProviderIntegrationMapping)
			.where(eq(ProviderIntegrationMapping.providerId, providerId))
			.orderBy(desc(ProviderIntegrationMapping.updatedAt)),
		db
			.select()
			.from(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.providerId, providerId))
			.orderBy(desc(ProviderIntegrationSyncRun.startedAt))
			.limit(20),
		db
			.select()
			.from(ProviderIntegrationSyncJob)
			.where(eq(ProviderIntegrationSyncJob.providerId, providerId))
			.orderBy(desc(ProviderIntegrationSyncJob.updatedAt))
			.limit(20),
		db
			.select()
			.from(ProviderIntegrationIncident)
			.where(eq(ProviderIntegrationIncident.providerId, providerId))
			.orderBy(desc(ProviderIntegrationIncident.lastSeenAt))
			.limit(30),
	])
	return { connections, mappings, runs, jobs, incidents }
}

export async function getProviderIntegrationConnectionOverview(params: {
	providerId: string
	connectionId: string
}) {
	const connection = await ownedConnection(params.providerId, params.connectionId)
	const [credential, mappings, incidents] = await Promise.all([
		db
			.select({
				authType: ProviderIntegrationCredential.authType,
				scopesJson: ProviderIntegrationCredential.scopesJson,
				tokenExpiresAt: ProviderIntegrationCredential.tokenExpiresAt,
				lastRefreshedAt: ProviderIntegrationCredential.lastRefreshedAt,
				revokedAt: ProviderIntegrationCredential.revokedAt,
			})
			.from(ProviderIntegrationCredential)
			.where(eq(ProviderIntegrationCredential.connectionId, params.connectionId))
			.then(first),
		db
			.select()
			.from(ProviderIntegrationMapping)
			.where(
				and(
					eq(ProviderIntegrationMapping.providerId, params.providerId),
					eq(ProviderIntegrationMapping.connectionId, params.connectionId)
				)
			)
			.orderBy(ProviderIntegrationMapping.mappingType, ProviderIntegrationMapping.updatedAt),
		db
			.select()
			.from(ProviderIntegrationIncident)
			.where(
				and(
					eq(ProviderIntegrationIncident.providerId, params.providerId),
					eq(ProviderIntegrationIncident.connectionId, params.connectionId),
					eq(ProviderIntegrationIncident.status, "open")
				)
			)
			.orderBy(desc(ProviderIntegrationIncident.lastSeenAt))
			.limit(5),
	])
	return {
		connection,
		credential: credential ?? null,
		mappings,
		openIncidents: incidents,
	}
}

export async function getProviderIntegrationConnectionDiagnostics(params: {
	providerId: string
	connectionId: string
}) {
	await ownedConnection(params.providerId, params.connectionId)
	const [credential, mappingGroups, incidents] = await Promise.all([
		db
			.select({
				authType: ProviderIntegrationCredential.authType,
				tokenExpiresAt: ProviderIntegrationCredential.tokenExpiresAt,
				lastRefreshedAt: ProviderIntegrationCredential.lastRefreshedAt,
				revokedAt: ProviderIntegrationCredential.revokedAt,
			})
			.from(ProviderIntegrationCredential)
			.where(eq(ProviderIntegrationCredential.connectionId, params.connectionId))
			.then(first),
		db
			.select({
				mappingType: ProviderIntegrationMapping.mappingType,
				count: sql<number>`count(*)`,
			})
			.from(ProviderIntegrationMapping)
			.where(
				and(
					eq(ProviderIntegrationMapping.providerId, params.providerId),
					eq(ProviderIntegrationMapping.connectionId, params.connectionId),
					eq(ProviderIntegrationMapping.status, "active")
				)
			)
			.groupBy(ProviderIntegrationMapping.mappingType),
		db
			.select({
				id: ProviderIntegrationIncident.id,
				severity: ProviderIntegrationIncident.severity,
				title: ProviderIntegrationIncident.title,
				description: ProviderIntegrationIncident.description,
				occurrenceCount: ProviderIntegrationIncident.occurrenceCount,
			})
			.from(ProviderIntegrationIncident)
			.where(
				and(
					eq(ProviderIntegrationIncident.providerId, params.providerId),
					eq(ProviderIntegrationIncident.connectionId, params.connectionId),
					eq(ProviderIntegrationIncident.status, "open")
				)
			)
			.orderBy(desc(ProviderIntegrationIncident.lastSeenAt))
			.limit(5),
	])
	return {
		credential: credential ?? null,
		mappingGroups: mappingGroups.map((group) => ({
			type: String(group.mappingType),
			count: Number(group.count ?? 0),
		})),
		openIncidents: incidents,
	}
}

export async function listProviderIntegrationMappingsForConnection(params: {
	providerId: string
	connectionId: string
}) {
	await ownedConnection(params.providerId, params.connectionId)
	return db
		.select({
			id: ProviderIntegrationMapping.id,
			mappingType: ProviderIntegrationMapping.mappingType,
			localEntityType: ProviderIntegrationMapping.localEntityType,
			localEntityId: ProviderIntegrationMapping.localEntityId,
			externalEntityType: ProviderIntegrationMapping.externalEntityType,
			externalEntityId: ProviderIntegrationMapping.externalEntityId,
			externalEntityName: ProviderIntegrationMapping.externalEntityName,
			status: ProviderIntegrationMapping.status,
			metadataJson: ProviderIntegrationMapping.metadataJson,
			lastVerifiedAt: ProviderIntegrationMapping.lastVerifiedAt,
		})
		.from(ProviderIntegrationMapping)
		.where(
			and(
				eq(ProviderIntegrationMapping.providerId, params.providerId),
				eq(ProviderIntegrationMapping.connectionId, params.connectionId)
			)
		)
		.orderBy(ProviderIntegrationMapping.mappingType, ProviderIntegrationMapping.updatedAt)
}

type ProviderIntegrationIncidentRow = Awaited<
	ReturnType<typeof loadProviderWorkspaceIntegrationIncidents>
>[number]

function toDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null
	if (value instanceof Date) return value
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function hydrateProviderIntegrationIncidents(rows: ProviderIntegrationIncidentRow[]) {
	return rows.map((row) => ({
		...row,
		firstSeenAt: toDate(row.firstSeenAt),
		lastSeenAt: toDate(row.lastSeenAt),
		resolvedAt: toDate(row.resolvedAt),
	}))
}

function providerIntegrationIncidentBaseFilter(params: {
	providerId: string
	connectionId?: string | null
}) {
	const providerFilter = eq(ProviderIntegrationIncident.providerId, params.providerId)
	const workspaceFilter = inArray(ProviderIntegrationConnection.connectorKey, [
		...WORKSPACE_CONNECTOR_KEYS,
	])
	if (!params.connectionId) return and(providerFilter, workspaceFilter)
	return and(
		providerFilter,
		eq(ProviderIntegrationIncident.connectionId, params.connectionId),
		workspaceFilter
	)
}

async function loadProviderWorkspaceIntegrationIncidents(params: {
	providerId: string
	status: "open" | "resolved" | "all"
	connectionId?: string | null
	limit: number
}) {
	if (params.connectionId) await ownedConnection(params.providerId, params.connectionId)
	const baseFilter = providerIntegrationIncidentBaseFilter(params)
	const filter =
		params.status === "all"
			? baseFilter
			: and(baseFilter, eq(ProviderIntegrationIncident.status, params.status))
	return db
		.select({
			id: ProviderIntegrationIncident.id,
			connectionId: ProviderIntegrationIncident.connectionId,
			connectionName: ProviderIntegrationConnection.displayName,
			connectorKey: ProviderIntegrationConnection.connectorKey,
			code: ProviderIntegrationIncident.code,
			category: ProviderIntegrationIncident.category,
			severity: ProviderIntegrationIncident.severity,
			status: ProviderIntegrationIncident.status,
			title: ProviderIntegrationIncident.title,
			description: ProviderIntegrationIncident.description,
			actionLabel: ProviderIntegrationIncident.actionLabel,
			actionHref: ProviderIntegrationIncident.actionHref,
			occurrenceCount: ProviderIntegrationIncident.occurrenceCount,
			firstSeenAt: ProviderIntegrationIncident.firstSeenAt,
			lastSeenAt: ProviderIntegrationIncident.lastSeenAt,
			resolvedAt: ProviderIntegrationIncident.resolvedAt,
			resolutionNote: ProviderIntegrationIncident.resolutionNote,
			notificationStatus: ProviderIntegrationIncident.notificationStatus,
		})
		.from(ProviderIntegrationIncident)
		.innerJoin(
			ProviderIntegrationConnection,
			eq(ProviderIntegrationConnection.id, ProviderIntegrationIncident.connectionId)
		)
		.where(filter)
		.orderBy(desc(ProviderIntegrationIncident.lastSeenAt))
		.limit(params.limit)
}

export async function listProviderWorkspaceIntegrationIncidents(params: {
	providerId: string
	status?: "open" | "resolved" | "all"
	connectionId?: string | null
	limit?: number
}) {
	const status = params.status ?? "open"
	const limit = Math.min(100, Math.max(1, params.limit ?? 50))
	const rows = await readThrough(
		cacheKeys.providerIntegrationsIncidents(
			params.providerId,
			status,
			params.connectionId ?? "",
			limit
		),
		cacheTtls.providerIntegrationsIncidents,
		async () =>
			loadProviderWorkspaceIntegrationIncidents({
				providerId: params.providerId,
				status,
				connectionId: params.connectionId,
				limit,
			})
	)
	return hydrateProviderIntegrationIncidents(rows as ProviderIntegrationIncidentRow[])
}

async function loadProviderWorkspaceIntegrationIncidentCounts(params: {
	providerId: string
	connectionId?: string | null
}) {
	if (params.connectionId) await ownedConnection(params.providerId, params.connectionId)
	const rows = await db
		.select({
			status: ProviderIntegrationIncident.status,
			count: sql<number>`count(*)`,
		})
		.from(ProviderIntegrationIncident)
		.innerJoin(
			ProviderIntegrationConnection,
			eq(ProviderIntegrationConnection.id, ProviderIntegrationIncident.connectionId)
		)
		.where(providerIntegrationIncidentBaseFilter(params))
		.groupBy(ProviderIntegrationIncident.status)
	const open = Number(rows.find((row) => row.status === "open")?.count ?? 0)
	const resolved = Number(rows.find((row) => row.status === "resolved")?.count ?? 0)
	return { open, resolved, all: open + resolved }
}

export async function countProviderWorkspaceIntegrationIncidents(params: {
	providerId: string
	connectionId?: string | null
}) {
	return readThrough(
		cacheKeys.providerIntegrationsIncidentCounts(params.providerId, params.connectionId ?? ""),
		cacheTtls.providerIntegrationsIncidents,
		async () => loadProviderWorkspaceIntegrationIncidentCounts(params)
	)
}

export async function listProviderIntegrationIncidents(params: {
	providerId: string
	status?: "open" | "resolved" | "all"
	connectionId?: string | null
	limit?: number
}) {
	if (params.connectionId) await ownedConnection(params.providerId, params.connectionId)
	const status = params.status ?? "open"
	const limit = Math.min(100, Math.max(1, params.limit ?? 50))
	const baseFilter = params.connectionId
		? and(
				eq(ProviderIntegrationIncident.providerId, params.providerId),
				eq(ProviderIntegrationIncident.connectionId, params.connectionId)
			)
		: eq(ProviderIntegrationIncident.providerId, params.providerId)
	const filter =
		status === "all" ? baseFilter : and(baseFilter, eq(ProviderIntegrationIncident.status, status))
	return db
		.select({
			id: ProviderIntegrationIncident.id,
			connectionId: ProviderIntegrationIncident.connectionId,
			connectionName: ProviderIntegrationConnection.displayName,
			connectorKey: ProviderIntegrationConnection.connectorKey,
			code: ProviderIntegrationIncident.code,
			category: ProviderIntegrationIncident.category,
			severity: ProviderIntegrationIncident.severity,
			status: ProviderIntegrationIncident.status,
			title: ProviderIntegrationIncident.title,
			description: ProviderIntegrationIncident.description,
			actionLabel: ProviderIntegrationIncident.actionLabel,
			actionHref: ProviderIntegrationIncident.actionHref,
			occurrenceCount: ProviderIntegrationIncident.occurrenceCount,
			firstSeenAt: ProviderIntegrationIncident.firstSeenAt,
			lastSeenAt: ProviderIntegrationIncident.lastSeenAt,
			resolvedAt: ProviderIntegrationIncident.resolvedAt,
			resolutionNote: ProviderIntegrationIncident.resolutionNote,
			notificationStatus: ProviderIntegrationIncident.notificationStatus,
		})
		.from(ProviderIntegrationIncident)
		.innerJoin(
			ProviderIntegrationConnection,
			eq(ProviderIntegrationConnection.id, ProviderIntegrationIncident.connectionId)
		)
		.where(filter)
		.orderBy(desc(ProviderIntegrationIncident.lastSeenAt))
		.limit(limit)
}

export async function listProviderIntegrationExecutionActivity(params: {
	providerId: string
	connectionId?: string | null
	page?: number
	pageSize?: number
	jobLimit?: number
}) {
	if (params.connectionId) await ownedConnection(params.providerId, params.connectionId)
	const page = Math.max(1, params.page ?? 1)
	const pageSize = Math.min(25, Math.max(5, params.pageSize ?? 10))
	const runFilter = params.connectionId
		? and(
				eq(ProviderIntegrationSyncRun.providerId, params.providerId),
				eq(ProviderIntegrationSyncRun.connectionId, params.connectionId)
			)
		: eq(ProviderIntegrationSyncRun.providerId, params.providerId)
	const jobFilter = params.connectionId
		? and(
				eq(ProviderIntegrationSyncJob.providerId, params.providerId),
				eq(ProviderIntegrationSyncJob.connectionId, params.connectionId),
				inArray(ProviderIntegrationSyncJob.status, ["queued", "running"])
			)
		: and(
				eq(ProviderIntegrationSyncJob.providerId, params.providerId),
				inArray(ProviderIntegrationSyncJob.status, ["queued", "running"])
			)
	const [runs, jobs] = await Promise.all([
		db
			.select({
				id: ProviderIntegrationSyncRun.id,
				connectorKey: ProviderIntegrationSyncRun.connectorKey,
				operation: ProviderIntegrationSyncRun.operation,
				trigger: ProviderIntegrationSyncRun.trigger,
				status: ProviderIntegrationSyncRun.status,
				readCount: ProviderIntegrationSyncRun.readCount,
				changedCount: ProviderIntegrationSyncRun.changedCount,
				skippedCount: ProviderIntegrationSyncRun.skippedCount,
				failedCount: ProviderIntegrationSyncRun.failedCount,
				idempotencyKey: ProviderIntegrationSyncRun.idempotencyKey,
				errorMessage: ProviderIntegrationSyncRun.errorMessage,
				startedAt: ProviderIntegrationSyncRun.startedAt,
				finishedAt: ProviderIntegrationSyncRun.finishedAt,
			})
			.from(ProviderIntegrationSyncRun)
			.where(runFilter)
			.orderBy(desc(ProviderIntegrationSyncRun.startedAt))
			.limit(pageSize + 1)
			.offset((page - 1) * pageSize),
		page === 1
			? db
					.select({
						id: ProviderIntegrationSyncJob.id,
						connectorKey: ProviderIntegrationSyncJob.connectorKey,
						operation: ProviderIntegrationSyncJob.operation,
						status: ProviderIntegrationSyncJob.status,
						trigger: ProviderIntegrationSyncJob.trigger,
						attempts: ProviderIntegrationSyncJob.attempts,
						maxAttempts: ProviderIntegrationSyncJob.maxAttempts,
						runAfter: ProviderIntegrationSyncJob.runAfter,
						updatedAt: ProviderIntegrationSyncJob.updatedAt,
					})
					.from(ProviderIntegrationSyncJob)
					.where(jobFilter)
					.orderBy(desc(ProviderIntegrationSyncJob.updatedAt))
					.limit(Math.min(20, Math.max(1, params.jobLimit ?? 10)))
			: Promise.resolve([]),
	])
	return {
		runs: runs.slice(0, pageSize),
		jobs,
		pagination: {
			page,
			pageSize,
			hasMore: runs.length > pageSize,
		},
	}
}

export async function listProviderIntegrationMappingCatalog(
	providerId: string,
	options?: { certificationFixtureProductId?: string | null }
): Promise<ProviderIntegrationMappingCatalog> {
	const certificationFixtureProductId = String(options?.certificationFixtureProductId ?? "").trim()
	const [products, variants, ratePlans, taxes] = await Promise.all([
		db
			.select({
				id: Product.id,
				name: Product.name,
				productType: Product.productType,
			})
			.from(Product)
			.where(eq(Product.providerId, providerId))
			.orderBy(Product.name)
			.limit(100),
		db
			.select({
				id: Variant.id,
				name: Variant.name,
				productId: Product.id,
				productName: Product.name,
				productState: ProductStatus.state,
			})
			.from(Variant)
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.leftJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
			.where(and(eq(Product.providerId, providerId), eq(Variant.isActive, true)))
			.orderBy(Product.name, Variant.name),
		db
			.select({
				id: RatePlan.id,
				name: RatePlan.name,
				variantId: Variant.id,
				variantName: Variant.name,
				productId: Product.id,
				productName: Product.name,
				isDefault: RatePlan.isDefault,
				variantActive: Variant.isActive,
				productState: ProductStatus.state,
			})
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.leftJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
			.where(and(eq(Product.providerId, providerId), eq(RatePlan.isActive, true)))
			.orderBy(Product.name, Variant.name, RatePlan.name),
		db
			.select({
				id: TaxFeeDefinition.id,
				name: TaxFeeDefinition.name,
				code: TaxFeeDefinition.code,
				status: TaxFeeDefinition.status,
			})
			.from(TaxFeeDefinition)
			.where(eq(TaxFeeDefinition.providerId, providerId))
			.orderBy(TaxFeeDefinition.name)
			.limit(100),
	])
	return {
		products: products.map((product) => ({
			id: product.id,
			label: `${product.name} · ${product.productType}`,
			entityType: "product",
		})),
		variants: variants.map((variant) => ({
			id: variant.id,
			label: `${variant.productName} / ${variant.name}`,
			name: variant.name,
			entityType: "variant",
			productId: variant.productId,
			productName: variant.productName,
			productPublished: variant.productState === "published",
			sellable: variant.productState === "published",
			certificationEligible:
				Boolean(certificationFixtureProductId) &&
				variant.productId === certificationFixtureProductId,
		})),
		ratePlans: ratePlans.map((ratePlan) => ({
			id: ratePlan.id,
			label: `${ratePlan.productName} / ${ratePlan.variantName} / ${ratePlan.name}`,
			name: ratePlan.name,
			entityType: "rate_plan",
			variantId: ratePlan.variantId,
			variantName: ratePlan.variantName,
			isDefault: Boolean(ratePlan.isDefault),
			productPublished: ratePlan.productState === "published",
			sellable: ratePlan.productState === "published" && Boolean(ratePlan.variantActive),
			certificationEligible:
				Boolean(certificationFixtureProductId) &&
				ratePlan.productId === certificationFixtureProductId,
		})),
		taxes: taxes.map((tax) => ({
			id: tax.id,
			label: `${tax.name} · ${tax.code} · ${tax.status}`,
			entityType: "tax",
		})),
	}
}
