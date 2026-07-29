import "dotenv/config"

import postgres from "postgres"

type ExplainRoot = {
	"Plan": ExplainNode
	"Planning Time": number
	"Execution Time": number
}

type ExplainNode = {
	"Node Type": string
	"Actual Rows": number
	"Index Name"?: string
	"Plans"?: ExplainNode[]
}

function connectionUrl() {
	const value =
		process.env.DIRECT_URL?.trim() ||
		process.env.SUPABASE_DB_URL?.trim() ||
		process.env.DATABASE_URL?.trim()
	if (!value) throw new Error("DIRECT_URL, SUPABASE_DB_URL or DATABASE_URL is required.")
	return value
}

function summarize(name: string, rows: postgres.RowList<Record<string, unknown>[]>) {
	const root = (rows[0]["QUERY PLAN"] as ExplainRoot[])[0]
	const indexes = new Set<string>()
	const visit = (node: ExplainNode) => {
		if (node["Index Name"]) indexes.add(node["Index Name"])
		for (const child of node.Plans ?? []) visit(child)
	}
	visit(root.Plan)
	return {
		name,
		node: root.Plan["Node Type"],
		actualRows: root.Plan["Actual Rows"],
		planningMs: root["Planning Time"],
		executionMs: root["Execution Time"],
		indexes: [...indexes],
	}
}

async function main() {
	const sql = postgres(connectionUrl(), { max: 1, prepare: false, onnotice: () => {} })
	try {
		const report = await sql.begin(async (tx) => {
			for (const table of [
				"ProviderIntegrationSyncJob",
				"ProviderExternalCalendar",
				"ProviderExternalCalendarEvent",
				"ProviderIntegrationIncident",
				"ProviderIntegrationSyncRun",
			]) {
				await tx.unsafe(
					`CREATE TEMP TABLE "${table}" (LIKE public."${table}" INCLUDING ALL) ON COMMIT DROP`
				)
			}

			await tx`
				INSERT INTO "ProviderIntegrationSyncJob" (
					"id", "providerId", "connectionId", "targetType", "targetId", "connectorKey",
					"operation", "status", "trigger", "priority", "attempts", "maxAttempts",
					"runAfter", "idempotencyKey", "createdAt", "updatedAt", "finishedAt"
				)
				SELECT
					'job-' || value,
					'provider-' || value % 100,
					CASE WHEN value % 2 = 0 THEN NULL ELSE 'connection-' || value END,
					CASE WHEN value % 2 = 0 THEN 'external_calendar' ELSE 'connection' END,
					CASE WHEN value % 2 = 0 THEN 'calendar-' || value ELSE 'connection-' || value END,
					CASE WHEN value % 2 = 0 THEN 'external_calendars' ELSE 'channel_manager' END,
					CASE WHEN value % 2 = 0 THEN 'calendar_import' ELSE 'connection_test' END,
					CASE WHEN value % 10 < 6 THEN 'queued'
						WHEN value % 10 < 8 THEN 'succeeded' ELSE 'failed' END,
					'scheduled',
					(value % 5) * 25,
					value % 4,
					5,
					CURRENT_TIMESTAMP + ((value % 240) - 120) * INTERVAL '1 minute',
					'job-key-' || value,
					CURRENT_TIMESTAMP - (value % 1440) * INTERVAL '1 minute',
					CURRENT_TIMESTAMP,
					CASE WHEN value % 10 >= 6 THEN CURRENT_TIMESTAMP ELSE NULL END
				FROM generate_series(1, 100000) AS value
			`
			await tx`
				INSERT INTO "ProviderExternalCalendar" (
					"id", "providerId", "connectionId", "variantId", "name", "feedUrlEncrypted",
					"feedUrlHost", "feedUrlFingerprint", "status", "syncEnabled", "nextSyncAt",
					"createdAt", "updatedAt"
				)
				SELECT
					'calendar-' || value,
					'provider-' || value % 100,
					'connection-' || value % 1000,
					'variant-' || value % 500,
					'Calendar ' || value,
					'{}'::jsonb,
					'example.test',
					'fingerprint-' || value,
					CASE WHEN value % 10 < 8 THEN 'active'
						WHEN value % 10 = 8 THEN 'error' ELSE 'revoked' END,
					value % 10 <> 9,
					CURRENT_TIMESTAMP + ((value % 240) - 120) * INTERVAL '1 minute',
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM generate_series(1, 20000) AS value
			`
			await tx`
				INSERT INTO "ProviderExternalCalendarEvent" (
					"id", "calendarId", "providerId", "variantId", "resourceId", "sourceKey",
					"externalUid", "startDate", "endDate", "fingerprint", "isActive",
					"firstSeenAt", "lastSeenAt"
				)
				SELECT
					'event-' || value,
					'calendar-' || value % 20000 + 1,
					'provider-' || value % 100,
					'variant-' || value % 500,
					CASE WHEN value % 3 = 0 THEN NULL ELSE 'resource-' || value % 1000 END,
					'source-' || value,
					'uid-' || value,
					CURRENT_DATE + (value % 120) - 60,
					CURRENT_DATE + (value % 120) - 58,
					'event-fingerprint-' || value,
					value % 5 <> 0,
					CURRENT_TIMESTAMP - (value % 365) * INTERVAL '1 day',
					CURRENT_TIMESTAMP - (value % 365) * INTERVAL '1 day'
				FROM generate_series(1, 200000) AS value
			`
			await tx`
				INSERT INTO "ProviderIntegrationIncident" (
					"id", "providerId", "connectionId", "dedupeKey", "code", "category",
					"severity", "status", "title", "description", "occurrenceCount",
					"firstSeenAt", "lastSeenAt", "notificationStatus", "createdAt", "updatedAt"
				)
				SELECT
					'incident-' || value,
					'provider-' || value % 100,
					'connection-' || value % 1000,
					'incident-key-' || value,
					'REMOTE_ERROR',
					'remote_api',
					CASE WHEN value % 10 = 0 THEN 'critical'
						WHEN value % 3 = 0 THEN 'error' ELSE 'warning' END,
					CASE WHEN value % 5 = 0 THEN 'open' ELSE 'resolved' END,
					'Incident ' || value,
					'Synthetic performance fixture',
					1,
					CURRENT_TIMESTAMP - (value % 365) * INTERVAL '1 day',
					CURRENT_TIMESTAMP - (value % 1440) * INTERVAL '1 minute',
					'pending',
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM generate_series(1, 20000) AS value
			`
			await tx`
				INSERT INTO "ProviderIntegrationSyncRun" (
					"id", "providerId", "connectionId", "connectorKey", "operation", "status",
					"startedAt", "finishedAt", "createdAt"
				)
				SELECT
					'run-' || value,
					'provider-' || value % 100,
					'connection-' || value % 1000,
					CASE WHEN value % 2 = 0 THEN 'external_calendars' ELSE 'channel_manager' END,
					CASE WHEN value % 2 = 0 THEN 'calendar_import' ELSE 'connection_test' END,
					CASE WHEN value % 10 < 8 THEN 'succeeded' ELSE 'failed' END,
					CURRENT_TIMESTAMP - (value % 86400) * INTERVAL '1 second',
					CURRENT_TIMESTAMP - (value % 86400) * INTERVAL '1 second'
						+ (value % 30 + 1) * INTERVAL '1 second',
					CURRENT_TIMESTAMP
				FROM generate_series(1, 100000) AS value
			`

			for (const table of [
				"ProviderIntegrationSyncJob",
				"ProviderExternalCalendar",
				"ProviderExternalCalendarEvent",
				"ProviderIntegrationIncident",
				"ProviderIntegrationSyncRun",
			]) {
				await tx.unsafe(`ANALYZE "${table}"`)
			}

			return [
				summarize(
					"claim_jobs",
					await tx`
						EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
						WITH candidates AS (
							SELECT "id", "providerId", "priority", "runAfter", "createdAt"
							FROM "ProviderIntegrationSyncJob"
							WHERE "status" = 'queued'
								AND "targetType" = 'external_calendar'
								AND "runAfter" <= CURRENT_TIMESTAMP
							ORDER BY "priority", "runAfter", "createdAt"
							LIMIT 480
						),
						ranked AS (
							SELECT "id", "priority", "runAfter", "createdAt",
								row_number() OVER (
									PARTITION BY "providerId"
									ORDER BY "priority", "runAfter", "createdAt"
								) AS provider_rank
							FROM candidates
						)
						SELECT job."id"
						FROM ranked
						INNER JOIN "ProviderIntegrationSyncJob" AS job ON job."id" = ranked."id"
						WHERE provider_rank <= 3 AND job."status" = 'queued'
						ORDER BY ranked."priority", ranked."runAfter", ranked."createdAt"
						LIMIT 20
						FOR UPDATE OF job SKIP LOCKED
					`
				),
				summarize(
					"due_calendars",
					await tx`
						EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
						SELECT "id", "providerId", "connectionId", "nextSyncAt"
						FROM "ProviderExternalCalendar"
						WHERE "syncEnabled" = TRUE
							AND "status" <> 'revoked'
							AND "nextSyncAt" <= CURRENT_TIMESTAMP
						ORDER BY "nextSyncAt", "id"
						LIMIT 20
					`
				),
				summarize(
					"active_events_variant_resource",
					await tx`
						EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
						SELECT "id", "calendarId", "resourceId", "startDate", "endDate"
						FROM "ProviderExternalCalendarEvent"
						WHERE "variantId" = 'variant-42'
							AND "resourceId" = 'resource-42'
							AND "isActive" = TRUE
							AND "startDate" < CURRENT_DATE + 30
							AND "endDate" > CURRENT_DATE
					`
				),
				summarize(
					"open_incidents",
					await tx`
						EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
						SELECT "id", "providerId", "severity", "lastSeenAt"
						FROM "ProviderIntegrationIncident"
						WHERE "status" = 'open'
						ORDER BY "lastSeenAt" DESC
						LIMIT 30
					`
				),
				summarize(
					"latest_runs_connection",
					await tx`
						EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
						SELECT "id", "status", "startedAt", "finishedAt"
						FROM "ProviderIntegrationSyncRun"
						WHERE "connectionId" = 'connection-42'
						ORDER BY "startedAt" DESC
						LIMIT 20
					`
				),
			]
		})
		console.log(JSON.stringify({ syntheticRows: 440000, report }, null, 2))
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
