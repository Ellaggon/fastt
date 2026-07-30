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

export async function listProviderIntegrationConnectionRows(providerId: string) {
	return db
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
}

export async function listProviderExternalCalendarConnectionRows(providerId: string) {
	return db
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
}

export async function getProviderIntegrationsSummaryReadModel(providerId: string) {
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
	const [connections, calendars] = await Promise.all([
		listProviderIntegrationConnectionRows(providerId),
		listProviderExternalCalendarConnectionRows(providerId),
	])
	return { connections, calendars }
}

export async function getProviderIntegrationsCatalogReadModel(providerId: string) {
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
	return rows[0] ?? null
}
