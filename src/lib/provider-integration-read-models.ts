import {
	and,
	db,
	desc,
	eq,
	inArray,
	ProviderExternalCalendar,
	ProviderExternalCalendarConflict,
	ProviderIntegrationConnection,
	ProviderIntegrationCredential,
	ProviderIntegrationIncident,
	ProviderIntegrationMapping,
	ProviderIntegrationSyncJob,
	ProviderIntegrationSyncRun,
	sql,
	Variant,
} from "@/shared/infrastructure/db/compat"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"

const workspaceConnectorKeys = ["channel_manager", "external_calendars"] as const

const connectionSelection = {
	id: ProviderIntegrationConnection.id,
	connectorKey: ProviderIntegrationConnection.connectorKey,
	displayName: ProviderIntegrationConnection.displayName,
	status: ProviderIntegrationConnection.status,
	mode: ProviderIntegrationConnection.mode,
	isPrimary: ProviderIntegrationConnection.isPrimary,
	lastSyncAt: ProviderIntegrationConnection.lastSyncAt,
	lastSyncStatus: ProviderIntegrationConnection.lastSyncStatus,
	errorMessage: ProviderIntegrationConnection.errorMessage,
	vendorKey: ProviderIntegrationConnection.vendorKey,
	authType: ProviderIntegrationConnection.authType,
	externalPropertyId: ProviderIntegrationConnection.externalPropertyId,
	scopesJson: ProviderIntegrationConnection.scopesJson,
	endpointUrl: ProviderIntegrationConnection.endpointUrl,
	syncEnabled: ProviderIntegrationConnection.syncEnabled,
	nextSyncAt: ProviderIntegrationConnection.nextSyncAt,
	lastAutomaticSyncAt: ProviderIntegrationConnection.lastAutomaticSyncAt,
	consecutiveFailures: ProviderIntegrationConnection.consecutiveFailures,
}

type ProviderIntegrationConnectionRow = {
	id: string
	connectorKey: string
	displayName: string | null
	status: string
	mode: string
	isPrimary: boolean | number
	lastSyncAt: Date | string | null
	lastSyncStatus: string | null
	errorMessage: string | null
	vendorKey: string | null
	authType: string | null
	externalPropertyId: string | null
	scopesJson: unknown
	endpointUrl: string | null
	syncEnabled: boolean | number
	nextSyncAt: Date | string | null
	lastAutomaticSyncAt: Date | string | null
	consecutiveFailures: number
}

type HydratedProviderIntegrationConnectionRow = Omit<
	ProviderIntegrationConnectionRow,
	"isPrimary" | "lastSyncAt" | "nextSyncAt" | "lastAutomaticSyncAt" | "syncEnabled"
> & {
	isPrimary: boolean
	syncEnabled: boolean
	lastSyncAt: Date | null
	nextSyncAt: Date | null
	lastAutomaticSyncAt: Date | null
}

type ProviderExternalCalendarConnectionRow = {
	id: string
	name: string
	status: string
	lastSyncAt: Date | string | null
	lastError: string | null
	variantId: string
	variantName: string | null
}

type HydratedProviderExternalCalendarConnectionRow = Omit<
	ProviderExternalCalendarConnectionRow,
	"lastSyncAt"
> & {
	lastSyncAt: Date | null
}

type ProviderExternalCalendarSummaryRow = {
	status: string
	lastSyncAt: Date | string | null
}

type HydratedProviderExternalCalendarSummaryRow = Omit<
	ProviderExternalCalendarSummaryRow,
	"lastSyncAt"
> & {
	lastSyncAt: Date | null
}

function toDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null
	if (value instanceof Date) return value
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function hydrateConnectionRows(
	rows: ProviderIntegrationConnectionRow[]
): HydratedProviderIntegrationConnectionRow[] {
	return rows.map((row) => ({
		...row,
		isPrimary: Boolean(row.isPrimary),
		syncEnabled: Boolean(row.syncEnabled),
		lastSyncAt: toDate(row.lastSyncAt),
		nextSyncAt: toDate(row.nextSyncAt),
		lastAutomaticSyncAt: toDate(row.lastAutomaticSyncAt),
	}))
}

function hydrateCalendarConnectionRows(
	rows: ProviderExternalCalendarConnectionRow[]
): HydratedProviderExternalCalendarConnectionRow[] {
	return rows.map((row) => ({
		...row,
		lastSyncAt: toDate(row.lastSyncAt),
	}))
}

function hydrateCalendarSummaryRows(
	rows: ProviderExternalCalendarSummaryRow[]
): HydratedProviderExternalCalendarSummaryRow[] {
	return rows.map((row) => ({
		...row,
		lastSyncAt: toDate(row.lastSyncAt),
	}))
}

export async function listProviderIntegrationConnectionRows(providerId: string) {
	const rows = await db
		.select(connectionSelection)
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, providerId),
				inArray(ProviderIntegrationConnection.connectorKey, [...workspaceConnectorKeys])
			)
		)
		.orderBy(
			desc(ProviderIntegrationConnection.isPrimary),
			desc(ProviderIntegrationConnection.updatedAt)
		)
	return hydrateConnectionRows(rows as ProviderIntegrationConnectionRow[])
}

export async function listProviderExternalCalendarConnectionRows(providerId: string) {
	const rows = await db
		.select({
			id: ProviderExternalCalendar.id,
			name: ProviderExternalCalendar.name,
			status: ProviderExternalCalendar.status,
			lastSyncAt: ProviderExternalCalendar.lastSyncAt,
			lastError: ProviderExternalCalendar.lastError,
			variantId: ProviderExternalCalendar.variantId,
			variantName: Variant.name,
		})
		.from(ProviderExternalCalendar)
		.leftJoin(Variant, eq(Variant.id, ProviderExternalCalendar.variantId))
		.where(
			and(
				eq(ProviderExternalCalendar.providerId, providerId),
				inArray(ProviderExternalCalendar.status, ["pending", "active", "error"])
			)
		)
		.orderBy(desc(ProviderExternalCalendar.updatedAt))
	return hydrateCalendarConnectionRows(rows as ProviderExternalCalendarConnectionRow[])
}

export async function getProviderIntegrationsSummaryReadModel(providerId: string) {
	return readThrough(
		cacheKeys.providerIntegrationsSummary(providerId),
		cacheTtls.providerIntegrationsSummary,
		async () => loadProviderIntegrationsSummaryReadModel(providerId)
	).then((model) => ({
		connections: hydrateConnectionRows(model.connections as ProviderIntegrationConnectionRow[]),
		calendars: hydrateCalendarSummaryRows(model.calendars as ProviderExternalCalendarSummaryRow[]),
	}))
}

async function loadProviderIntegrationsSummaryReadModel(providerId: string) {
	const [connections, calendars] = await Promise.all([
		listProviderIntegrationConnectionRows(providerId),
		db
			.select({
				status: ProviderExternalCalendar.status,
				lastSyncAt: ProviderExternalCalendar.lastSyncAt,
			})
			.from(ProviderExternalCalendar)
			.where(
				and(
					eq(ProviderExternalCalendar.providerId, providerId),
					inArray(ProviderExternalCalendar.status, ["pending", "active", "error"])
				)
			),
	])
	return { connections, calendars }
}

export async function getProviderIntegrationsConnectionsReadModel(providerId: string) {
	return readThrough(
		cacheKeys.providerIntegrationsConnections(providerId),
		cacheTtls.providerIntegrationsConnections,
		async () => loadProviderIntegrationsConnectionsReadModel(providerId)
	).then((model) => ({
		connections: hydrateConnectionRows(model.connections as ProviderIntegrationConnectionRow[]),
		calendars: hydrateCalendarConnectionRows(
			model.calendars as ProviderExternalCalendarConnectionRow[]
		),
	}))
}

async function loadProviderIntegrationsConnectionsReadModel(providerId: string) {
	const [connections, calendars] = await Promise.all([
		listProviderIntegrationConnectionRows(providerId),
		listProviderExternalCalendarConnectionRows(providerId),
	])
	return { connections, calendars }
}

export async function getProviderIntegrationsCatalogReadModel(providerId: string) {
	return readThrough(
		cacheKeys.providerIntegrationsCatalog(providerId),
		cacheTtls.providerIntegrationsCatalog,
		async () => loadProviderIntegrationsCatalogReadModel(providerId)
	)
}

async function loadProviderIntegrationsCatalogReadModel(providerId: string) {
	const [connections, calendars, conflictRows] = await Promise.all([
		db
			.select({
				connectorKey: ProviderIntegrationConnection.connectorKey,
				status: ProviderIntegrationConnection.status,
			})
			.from(ProviderIntegrationConnection)
			.where(
				and(
					eq(ProviderIntegrationConnection.providerId, providerId),
					inArray(ProviderIntegrationConnection.connectorKey, [...workspaceConnectorKeys])
				)
			),
		db
			.select({ status: ProviderExternalCalendar.status })
			.from(ProviderExternalCalendar)
			.where(
				and(
					eq(ProviderExternalCalendar.providerId, providerId),
					inArray(ProviderExternalCalendar.status, ["pending", "active", "error"])
				)
			),
		db
			.select({ count: sql<number>`count(*)` })
			.from(ProviderExternalCalendarConflict)
			.where(
				and(
					eq(ProviderExternalCalendarConflict.providerId, providerId),
					eq(ProviderExternalCalendarConflict.status, "open")
				)
			),
	])
	return {
		connections,
		calendars,
		openConflictCount: Number(conflictRows[0]?.count ?? 0),
	}
}

export async function getProviderIntegrationConnectionReadModel(params: {
	providerId: string
	connectionId: string
}) {
	const rows = await db
		.select(connectionSelection)
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, params.providerId),
				eq(ProviderIntegrationConnection.id, params.connectionId),
				inArray(ProviderIntegrationConnection.connectorKey, [...workspaceConnectorKeys])
			)
		)
		.limit(1)
	const hydrated = hydrateConnectionRows(rows as ProviderIntegrationConnectionRow[])
	return hydrated[0] ?? null
}

export async function getProviderChannelManagerOperationalReadModel(params: {
	providerId: string
	connectionId: string
}) {
	const connection = await getProviderIntegrationConnectionReadModel(params)
	if (!connection || connection.connectorKey !== "channel_manager") return null
	const { listProviderIntegrationMappingCatalog } =
		await import("@/lib/provider-integration-operations")
	const commercialOperations = [
		"initial_ari_sync",
		"incremental_availability_sync",
		"incremental_rates_restrictions_sync",
	]
	const [catalog, mappings, runs, jobs, incidents, credential] = await Promise.all([
		listProviderIntegrationMappingCatalog(params.providerId),
		db
			.select({
				mappingType: ProviderIntegrationMapping.mappingType,
				localEntityId: ProviderIntegrationMapping.localEntityId,
				status: ProviderIntegrationMapping.status,
			})
			.from(ProviderIntegrationMapping)
			.where(eq(ProviderIntegrationMapping.connectionId, params.connectionId)),
		db
			.select({
				id: ProviderIntegrationSyncRun.id,
				operation: ProviderIntegrationSyncRun.operation,
				status: ProviderIntegrationSyncRun.status,
				readCount: ProviderIntegrationSyncRun.readCount,
				changedCount: ProviderIntegrationSyncRun.changedCount,
				skippedCount: ProviderIntegrationSyncRun.skippedCount,
				failedCount: ProviderIntegrationSyncRun.failedCount,
				summaryJson: ProviderIntegrationSyncRun.summaryJson,
				errorMessage: ProviderIntegrationSyncRun.errorMessage,
				startedAt: ProviderIntegrationSyncRun.startedAt,
				finishedAt: ProviderIntegrationSyncRun.finishedAt,
			})
			.from(ProviderIntegrationSyncRun)
			.where(eq(ProviderIntegrationSyncRun.connectionId, params.connectionId))
			.orderBy(desc(ProviderIntegrationSyncRun.startedAt))
			.limit(20),
		db
			.select({
				id: ProviderIntegrationSyncJob.id,
				operation: ProviderIntegrationSyncJob.operation,
				status: ProviderIntegrationSyncJob.status,
				runAfter: ProviderIntegrationSyncJob.runAfter,
				payloadJson: ProviderIntegrationSyncJob.payloadJson,
			})
			.from(ProviderIntegrationSyncJob)
			.where(
				and(
					eq(ProviderIntegrationSyncJob.connectionId, params.connectionId),
					inArray(ProviderIntegrationSyncJob.status, ["queued", "running"])
				)
			)
			.orderBy(ProviderIntegrationSyncJob.runAfter)
			.limit(20),
		db
			.select({
				id: ProviderIntegrationIncident.id,
				severity: ProviderIntegrationIncident.severity,
				title: ProviderIntegrationIncident.title,
				description: ProviderIntegrationIncident.description,
				lastSeenAt: ProviderIntegrationIncident.lastSeenAt,
			})
			.from(ProviderIntegrationIncident)
			.where(
				and(
					eq(ProviderIntegrationIncident.connectionId, params.connectionId),
					eq(ProviderIntegrationIncident.status, "open")
				)
			)
			.orderBy(desc(ProviderIntegrationIncident.lastSeenAt))
			.limit(5),
		db
			.select({ revokedAt: ProviderIntegrationCredential.revokedAt })
			.from(ProviderIntegrationCredential)
			.where(eq(ProviderIntegrationCredential.connectionId, params.connectionId))
			.limit(1)
			.then((rows) => rows[0] ?? null),
	])

	const sellableRooms = catalog.variants.filter((item) => item.sellable)
	const sellableRates = catalog.ratePlans.filter((item) => item.sellable)
	const activeRoomMappings = new Set(
		mappings
			.filter((item) => item.status === "active" && item.mappingType === "room_type")
			.map((item) => item.localEntityId)
	)
	const activeRateMappings = new Set(
		mappings
			.filter((item) => item.status === "active" && item.mappingType === "rate_plan")
			.map((item) => item.localEntityId)
	)
	const roomMapped = sellableRooms.filter((item) => activeRoomMappings.has(item.id)).length
	const rateMapped = sellableRates.filter((item) => activeRateMappings.has(item.id)).length
	const coverageComplete =
		sellableRooms.length > 0 &&
		sellableRates.length > 0 &&
		roomMapped === sellableRooms.length &&
		rateMapped === sellableRates.length
	const initialJob = jobs.find((item) => item.operation === "initial_ari_sync") ?? null
	const latestInitialRun = runs.find((item) => item.operation === "initial_ari_sync") ?? null
	const latestCommercialRun =
		runs.find((item) => commercialOperations.includes(String(item.operation))) ?? null
	const latestAccessRun = runs.find((item) => item.operation === "connection_test") ?? null
	const initialSyncState = initialJob
		? initialJob.status === "running"
			? ("running" as const)
			: ("queued" as const)
		: latestInitialRun?.status === "succeeded"
			? ("succeeded" as const)
			: latestInitialRun?.status === "partial"
				? ("partial" as const)
				: latestInitialRun?.status === "failed"
					? ("failed" as const)
					: ("none" as const)
	const accessValidated =
		latestAccessRun?.status === "succeeded" ||
		[
			"preflight_success",
			"initial_ari_succeeded",
			"initial_ari_partial",
			"initial_ari_failed",
			"incremental_ari_succeeded",
			"incremental_ari_partial",
			"incremental_ari_failed",
		].includes(String(connection.lastSyncStatus ?? ""))
	const nextJob = jobs[0] ?? null

	return {
		connection,
		accessValidated,
		credentialRevoked: Boolean(credential?.revokedAt),
		coverage: {
			rooms: { mapped: roomMapped, total: sellableRooms.length },
			rates: { mapped: rateMapped, total: sellableRates.length },
			complete: coverageComplete,
			percent:
				sellableRooms.length + sellableRates.length > 0
					? Math.round(
							((roomMapped + rateMapped) / (sellableRooms.length + sellableRates.length)) * 100
						)
					: 0,
		},
		initialSyncState,
		latestRun: latestCommercialRun,
		activeJob: nextJob,
		openIncidents: incidents,
		nextExecutionAt: toDate(nextJob?.runAfter ?? connection.nextSyncAt),
	}
}
