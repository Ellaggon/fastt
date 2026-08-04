import {
	and,
	db,
	desc,
	eq,
	inArray,
	ProviderExternalCalendar,
	ProviderExternalCalendarConflict,
	ProviderIntegrationConnection,
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
}

type HydratedProviderIntegrationConnectionRow = Omit<
	ProviderIntegrationConnectionRow,
	"isPrimary" | "lastSyncAt"
> & {
	isPrimary: boolean
	lastSyncAt: Date | null
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
		lastSyncAt: toDate(row.lastSyncAt),
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
