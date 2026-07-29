import { db, sql } from "@/shared/infrastructure/db/compat"

export type ProviderIntegrationOperationalMetric = {
	name: string
	value: number
	labels?: Record<string, string>
}

function number(value: unknown): number {
	const parsed = Number(value ?? 0)
	return Number.isFinite(parsed) ? parsed : 0
}

export async function collectProviderIntegrationOperationalMetrics(): Promise<
	ProviderIntegrationOperationalMetric[]
> {
	const [queueRows, failureRows, eventRows, incidentRows, latencyRows] = await Promise.all([
		db.execute(sql`
			SELECT
				"targetType" AS "targetType",
				count(*) FILTER (WHERE "status" = 'queued')::int AS "depth",
				coalesce(
					max(extract(epoch FROM (CURRENT_TIMESTAMP - "createdAt")))
						FILTER (WHERE "status" = 'queued'),
					0
				) AS "oldestAgeSeconds",
				count(*) FILTER (
					WHERE "status" IN ('queued', 'running') AND "attempts" > 0
				)::int AS "retryJobs",
				coalesce(sum("attempts") FILTER (
					WHERE "status" IN ('queued', 'running')
				), 0)::int AS "retryAttempts"
			FROM "ProviderIntegrationSyncJob"
			WHERE "status" IN ('queued', 'running')
			GROUP BY "targetType"
		`),
		db.execute(sql`
			SELECT 'connection' AS "entityType",
				coalesce(max("consecutiveFailures"), 0)::int AS "maximum",
				count(*) FILTER (WHERE "consecutiveFailures" > 0)::int AS "affected"
			FROM "ProviderIntegrationConnection"
			WHERE "status" <> 'revoked'
			UNION ALL
			SELECT 'calendar' AS "entityType",
				coalesce(max("consecutiveFailures"), 0)::int AS "maximum",
				count(*) FILTER (WHERE "consecutiveFailures" > 0)::int AS "affected"
			FROM "ProviderExternalCalendar"
			WHERE "status" <> 'revoked'
		`),
		db.execute(sql`
			SELECT
				calendar."id" AS "calendarId",
				calendar."providerId" AS "providerId",
				count(event."id")::int AS "total",
				count(event."id") FILTER (WHERE event."isActive" = TRUE)::int AS "active"
			FROM "ProviderExternalCalendar" AS calendar
			LEFT JOIN "ProviderExternalCalendarEvent" AS event
				ON event."calendarId" = calendar."id"
			WHERE calendar."status" <> 'revoked'
			GROUP BY calendar."id", calendar."providerId"
		`),
		db.execute(sql`
			SELECT "severity", count(*)::int AS "count"
			FROM "ProviderIntegrationIncident"
			WHERE "status" = 'open'
			GROUP BY "severity"
		`),
		db.execute(sql`
			SELECT
				"connectorKey" AS "connectorKey",
				coalesce(avg(extract(epoch FROM ("finishedAt" - "startedAt"))) * 1000, 0)
					AS "averageMs",
				coalesce(
					percentile_cont(0.95) WITHIN GROUP (
						ORDER BY extract(epoch FROM ("finishedAt" - "startedAt")) * 1000
					),
					0
				) AS "p95Ms"
			FROM "ProviderIntegrationSyncRun"
			WHERE "finishedAt" IS NOT NULL
				AND "startedAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
			GROUP BY "connectorKey"
		`),
	])

	const metrics: ProviderIntegrationOperationalMetric[] = []
	const queueByTarget = new Map(
		Array.from(queueRows as unknown as Record<string, unknown>[]).map((row) => [
			String(row.targetType),
			row,
		])
	)
	for (const targetType of ["connection", "external_calendar"]) {
		const row = queueByTarget.get(targetType) ?? {}
		const labels = { target_type: targetType }
		metrics.push(
			{ name: "provider_integration_queue_depth", value: number(row.depth), labels },
			{
				name: "provider_integration_queue_oldest_age_seconds",
				value: number(row.oldestAgeSeconds),
				labels,
			},
			{
				name: "provider_integration_queue_retry_jobs",
				value: number(row.retryJobs),
				labels,
			},
			{
				name: "provider_integration_queue_retry_attempts",
				value: number(row.retryAttempts),
				labels,
			}
		)
	}
	for (const row of Array.from(failureRows as unknown as Record<string, unknown>[])) {
		const labels = { entity_type: String(row.entityType) }
		metrics.push(
			{
				name: "provider_integration_consecutive_failures_max",
				value: number(row.maximum),
				labels,
			},
			{
				name: "provider_integration_consecutive_failures_entities",
				value: number(row.affected),
				labels,
			}
		)
	}
	for (const row of Array.from(eventRows as unknown as Record<string, unknown>[])) {
		const labels = {
			provider_id: String(row.providerId),
			calendar_id: String(row.calendarId),
		}
		metrics.push(
			{
				name: "provider_external_calendar_events",
				value: number(row.total),
				labels: { ...labels, state: "total" },
			},
			{
				name: "provider_external_calendar_events",
				value: number(row.active),
				labels: { ...labels, state: "active" },
			}
		)
	}
	const incidentsBySeverity = new Map(
		Array.from(incidentRows as unknown as Record<string, unknown>[]).map((row) => [
			String(row.severity),
			number(row.count),
		])
	)
	for (const severity of ["info", "warning", "error", "critical"]) {
		metrics.push({
			name: "provider_integration_open_incidents",
			value: incidentsBySeverity.get(severity) ?? 0,
			labels: { severity },
		})
	}
	for (const row of Array.from(latencyRows as unknown as Record<string, unknown>[])) {
		const labels = { connector_key: String(row.connectorKey) }
		metrics.push(
			{
				name: "provider_integration_run_duration_average_ms",
				value: number(row.averageMs),
				labels,
			},
			{
				name: "provider_integration_run_duration_p95_ms",
				value: number(row.p95Ms),
				labels,
			}
		)
	}
	return metrics
}
