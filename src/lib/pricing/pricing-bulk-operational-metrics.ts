import { db, sql } from "@/shared/infrastructure/db/compat"

export type PricingBulkOperationalMetric = {
	name: string
	value: number
	labels?: Record<string, string>
}

function number(value: unknown): number {
	const parsed = Number(value ?? 0)
	return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Reads the durable pricing queue rather than process memory. This remains
 * meaningful across serverless invocations and worker restarts.
 */
export async function collectPricingBulkOperationalMetrics(): Promise<
	PricingBulkOperationalMetric[]
> {
	const [queueRows, runRows] = await Promise.all([
		db.execute(sql`
			SELECT
				"status" AS "status",
				count(*)::int AS "depth",
				coalesce(max(extract(epoch FROM (CURRENT_TIMESTAMP - "createdAt"))), 0)
					AS "oldestAgeSeconds",
				count(*) FILTER (WHERE "attempts" > 0 OR "finalizationAttempts" > 0)::int
					AS "retryJobs",
				coalesce(sum("attempts" + "finalizationAttempts"), 0)::int AS "retryAttempts",
					count(*) FILTER (WHERE "status" = 'requires_attention')::int AS "failedJobs"
				FROM "PricingBulkOperationJob"
				WHERE "status" IN ('queued', 'running', 'finalizing', 'requires_attention')
			GROUP BY "status"
		`),
		db.execute(sql`
			SELECT
				"status" AS "status",
				count(*)::int AS "runs",
				coalesce(avg(extract(epoch FROM ("finishedAt" - "startedAt"))) * 1000, 0)
					AS "averageMs",
				coalesce(percentile_cont(0.95) WITHIN GROUP (
					ORDER BY extract(epoch FROM ("finishedAt" - "startedAt")) * 1000
				), 0) AS "p95Ms"
			FROM "PricingBulkOperationJob"
			WHERE "finishedAt" IS NOT NULL
				AND "startedAt" IS NOT NULL
				AND "startedAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
			GROUP BY "status"
		`),
	])

	const queueByStatus = new Map(
		Array.from(queueRows as unknown as Record<string, unknown>[]).map((row) => [
			String(row.status),
			row,
		])
	)
	const metrics: PricingBulkOperationalMetric[] = []
	for (const status of ["queued", "running", "finalizing", "requires_attention"]) {
		const row = queueByStatus.get(status) ?? {}
		const labels = { status }
		metrics.push(
			{ name: "pricing_bulk_job_queue_depth", value: number(row.depth), labels },
			{
				name: "pricing_bulk_job_queue_oldest_age_seconds",
				value: number(row.oldestAgeSeconds),
				labels,
			},
			{ name: "pricing_bulk_job_retry_jobs", value: number(row.retryJobs), labels },
			{ name: "pricing_bulk_job_retry_attempts", value: number(row.retryAttempts), labels },
			{ name: "pricing_bulk_job_failures", value: number(row.failedJobs), labels }
		)
	}

	for (const row of Array.from(runRows as unknown as Record<string, unknown>[])) {
		const labels = { status: String(row.status) }
		metrics.push(
			{ name: "pricing_bulk_job_runs_total_24h", value: number(row.runs), labels },
			{
				name: "pricing_bulk_job_run_duration_average_ms",
				value: number(row.averageMs),
				labels,
			},
			{ name: "pricing_bulk_job_run_duration_p95_ms", value: number(row.p95Ms), labels }
		)
	}
	return metrics
}
