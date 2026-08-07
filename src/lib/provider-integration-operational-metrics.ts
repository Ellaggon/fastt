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

function operationalLabels(row: Record<string, unknown>) {
	return {
		provider_id: String(row.providerId ?? "unknown"),
		property_id: String(row.propertyId ?? "unassigned"),
		operation: String(row.operation ?? "unknown"),
		result: String(row.result ?? row.status ?? "pending"),
	}
}

export async function collectProviderIntegrationOperationalMetrics(): Promise<
	ProviderIntegrationOperationalMetric[]
> {
	const [
		queueRows,
		detailedQueueRows,
		failureRows,
		eventRows,
		incidentRows,
		runRows,
		blockedBookingRows,
	] = await Promise.all([
		db.execute(sql`
			SELECT
				"targetType" AS "targetType",
				count(*) FILTER (WHERE "status" = 'queued')::int AS "depth",
				coalesce(max(extract(epoch FROM (CURRENT_TIMESTAMP - "createdAt")))
					FILTER (WHERE "status" = 'queued'), 0) AS "oldestAgeSeconds",
				count(*) FILTER (WHERE "status" IN ('queued', 'running') AND "attempts" > 0)::int
					AS "retryJobs",
				coalesce(sum("attempts") FILTER (WHERE "status" IN ('queued', 'running')), 0)::int
					AS "retryAttempts"
			FROM "ProviderIntegrationSyncJob"
			WHERE "status" IN ('queued', 'running')
			GROUP BY "targetType"
		`),
		db.execute(sql`
			SELECT
				job."providerId" AS "providerId",
				coalesce(connection."externalPropertyId", 'unassigned') AS "propertyId",
				job."operation" AS "operation",
				count(*) FILTER (WHERE job."status" = 'queued')::int AS "depth",
				coalesce(max(extract(epoch FROM (CURRENT_TIMESTAMP - job."createdAt")))
					FILTER (WHERE job."status" = 'queued'), 0) AS "oldestAgeSeconds",
				count(*) FILTER (WHERE job."attempts" > 0)::int AS "retryJobs",
				coalesce(sum(job."attempts"), 0)::int AS "retryAttempts"
			FROM "ProviderIntegrationSyncJob" AS job
			LEFT JOIN "ProviderIntegrationConnection" AS connection
				ON connection."id" = job."connectionId"
			WHERE job."targetType" = 'connection' AND job."status" IN ('queued', 'running')
			GROUP BY job."providerId", connection."externalPropertyId", job."operation"
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
			SELECT calendar."id" AS "calendarId", calendar."providerId" AS "providerId",
				count(event."id")::int AS "total",
				count(event."id") FILTER (WHERE event."isActive" = TRUE)::int AS "active"
			FROM "ProviderExternalCalendar" AS calendar
			LEFT JOIN "ProviderExternalCalendarEvent" AS event ON event."calendarId" = calendar."id"
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
				run."providerId" AS "providerId",
				coalesce(connection."externalPropertyId", run."summaryJson" #>> '{telemetry,propertyId}',
					run."summaryJson" #>> '{propertyId}', 'unassigned') AS "propertyId",
				run."operation" AS "operation",
				run."status" AS "result",
				count(*)::int AS "runs",
				coalesce(avg(extract(epoch FROM (run."finishedAt" - run."startedAt"))) * 1000, 0)
					AS "averageMs",
				coalesce(percentile_cont(0.95) WITHIN GROUP (
					ORDER BY extract(epoch FROM (run."finishedAt" - run."startedAt")) * 1000
				), 0) AS "p95Ms",
				coalesce(avg(CASE
					WHEN coalesce(run."summaryJson" #>> '{telemetry,changeLatencyMs}', '') ~ '^[0-9]+([.][0-9]+)?$'
					THEN (run."summaryJson" #>> '{telemetry,changeLatencyMs}')::numeric
				END), 0) AS "changeLatencyAverageMs",
				coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY CASE
					WHEN coalesce(run."summaryJson" #>> '{telemetry,changeLatencyMs}', '') ~ '^[0-9]+([.][0-9]+)?$'
					THEN (run."summaryJson" #>> '{telemetry,changeLatencyMs}')::numeric
				END), 0) AS "changeLatencyP95Ms",
				coalesce(sum(run."failedCount") FILTER (WHERE run."status" = 'partial'), 0)::int
					AS "partialRejected",
				count(*) FILTER (WHERE
					coalesce(run."errorCode", '') ILIKE '%RATE_LIMIT%'
					OR coalesce(run."errorCode", '') ILIKE '%429%'
					OR coalesce(run."errorMessage", '') ILIKE '%429%'
				)::int AS "rateLimited"
			FROM "ProviderIntegrationSyncRun" AS run
			LEFT JOIN "ProviderIntegrationConnection" AS connection ON connection."id" = run."connectionId"
			WHERE run."finishedAt" IS NOT NULL
				AND run."startedAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
			GROUP BY run."providerId", connection."externalPropertyId",
				run."summaryJson" #>> '{telemetry,propertyId}', run."summaryJson" #>> '{propertyId}',
				run."operation", run."status"
		`),
		db.execute(sql`
			SELECT incident."providerId" AS "providerId",
				coalesce(connection."externalPropertyId", incident."metadataJson" #>> '{propertyId}',
					'unassigned') AS "propertyId",
				count(*)::int AS "count"
			FROM "ProviderIntegrationIncident" AS incident
			INNER JOIN "ProviderIntegrationConnection" AS connection
				ON connection."id" = incident."connectionId"
			WHERE incident."status" = 'open' AND incident."entityType" = 'booking_revision'
			GROUP BY incident."providerId", connection."externalPropertyId",
				incident."metadataJson" #>> '{propertyId}'
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
			{ name: "provider_integration_queue_retry_jobs", value: number(row.retryJobs), labels },
			{
				name: "provider_integration_queue_retry_attempts",
				value: number(row.retryAttempts),
				labels,
			}
		)
	}
	for (const row of Array.from(detailedQueueRows as unknown as Record<string, unknown>[])) {
		const labels = operationalLabels(row)
		metrics.push(
			{ name: "provider_integration_operation_queue_depth", value: number(row.depth), labels },
			{
				name: "provider_integration_operation_queue_oldest_age_seconds",
				value: number(row.oldestAgeSeconds),
				labels,
			},
			{
				name: "provider_integration_operation_retry_jobs",
				value: number(row.retryJobs),
				labels,
			},
			{
				name: "provider_integration_operation_retry_attempts",
				value: number(row.retryAttempts),
				labels,
			}
		)
	}
	for (const row of Array.from(failureRows as unknown as Record<string, unknown>[])) {
		const labels = { entity_type: String(row.entityType) }
		metrics.push(
			{ name: "provider_integration_consecutive_failures_max", value: number(row.maximum), labels },
			{
				name: "provider_integration_consecutive_failures_entities",
				value: number(row.affected),
				labels,
			}
		)
	}
	for (const row of Array.from(eventRows as unknown as Record<string, unknown>[])) {
		const labels = { provider_id: String(row.providerId), calendar_id: String(row.calendarId) }
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
	for (const row of Array.from(runRows as unknown as Record<string, unknown>[])) {
		const labels = operationalLabels(row)
		metrics.push(
			{ name: "provider_integration_runs_total_24h", value: number(row.runs), labels },
			{
				name: "provider_integration_run_duration_average_ms",
				value: number(row.averageMs),
				labels,
			},
			{ name: "provider_integration_run_duration_p95_ms", value: number(row.p95Ms), labels },
			{
				name: "provider_integration_change_delivery_latency_average_ms",
				value: number(row.changeLatencyAverageMs),
				labels,
			},
			{
				name: "provider_integration_change_delivery_latency_p95_ms",
				value: number(row.changeLatencyP95Ms),
				labels,
			},
			{
				name: "provider_integration_partial_rejections_total_24h",
				value: number(row.partialRejected),
				labels,
			},
			{
				name: "provider_integration_rate_limit_429_total_24h",
				value: number(row.rateLimited),
				labels,
			}
		)
	}
	for (const row of Array.from(blockedBookingRows as unknown as Record<string, unknown>[])) {
		metrics.push({
			name: "provider_integration_booking_revisions_unacknowledged",
			value: number(row.count),
			labels: operationalLabels({
				...row,
				operation: "booking_revision_feed",
				result: "blocked",
			}),
		})
	}
	return metrics
}
