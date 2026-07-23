import {
	db,
	SearchMaterializationLog,
	SearchUnitView,
	sql,
} from "@/shared/infrastructure/db/compat"

import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { listRecentSearchMaterializationLogs } from "./searchMaterializationLog"

export type SearchFreshnessMonitor = {
	ok: boolean
	scope: {
		maxLagMinutes: number
		staleCutoff: string
		pastDays: number
		futureDays: number
	}
	freshness: {
		totalRows: number
		freshRows: number
		staleRows: number
		stalePercent: number
		lastMaterializedAt: string | null
		oldestMaterializedAt: string | null
	}
	errors: {
		failedRuns24h: number
		lastErrorAt: string | null
		lastErrorMessage: string | null
		source: "SearchMaterializationLog"
	}
	materialization: {
		lastRunAt: string | null
		lastStatus: string | null
		lastDurationMs: number | null
		avgDurationMs24h: number | null
		p95DurationMs24h: number | null
		rowsMaterialized24h: number
		runs24h: number
		recentRuns: Array<{
			runId: string
			trigger: string
			status: string
			rowsMaterialized: number
			variantsScanned: number
			durationMs: number | null
			errorMessage: string | null
			startedAt: string | null
			finishedAt: string | null
		}>
	}
	cacheState: "hit" | "miss"
}

function percent(part: number, total: number): number {
	if (total <= 0) return 0
	return Number(((part / total) * 100).toFixed(2))
}

function asIso(value: unknown): string | null {
	if (!value) return null
	const parsed = value instanceof Date ? value : new Date(String(value))
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

async function loadSearchFreshnessMonitor(
	maxLagMinutes: number
): Promise<Omit<SearchFreshnessMonitor, "cacheState">> {
	const cutoff = new Date(Date.now() - maxLagMinutes * 60_000)
	const pastDays = Math.max(
		0,
		Math.trunc(Number(process.env.FASTT_SEARCH_RETENTION_PAST_DAYS ?? 0))
	)
	const futureDays = Math.max(
		1,
		Math.trunc(Number(process.env.FASTT_SEARCH_RETENTION_FUTURE_DAYS ?? 30))
	)
	const row = await db
		.select({
			totalRows: sql<number>`count(*)`,
			staleRows: sql<number>`coalesce(sum(case when ${SearchUnitView.computedAt} < ${cutoff} then 1 else 0 end), 0)`,
			lastMaterializedAt: sql<Date | null>`max(${SearchUnitView.computedAt})`,
			oldestMaterializedAt: sql<Date | null>`min(${SearchUnitView.computedAt})`,
		})
		.from(SearchUnitView)
		.where(
			sql`
			${SearchUnitView.date} >= current_date - (${pastDays}::int * interval '1 day')
			and ${SearchUnitView.date} < current_date + (${futureDays}::int * interval '1 day')
		`
		)
		.then((rows) => rows[0])
	const logRow = await db
		.select({
			runs24h: sql<number>`count(*) filter (where ${SearchMaterializationLog.startedAt} >= now() - interval '24 hours')`,
			failedRuns24h: sql<number>`count(*) filter (where ${SearchMaterializationLog.status} = 'failed' and ${SearchMaterializationLog.startedAt} >= now() - interval '24 hours')`,
			lastRunAt: sql<Date | null>`max(${SearchMaterializationLog.startedAt})`,
			lastErrorAt: sql<Date | null>`max(${SearchMaterializationLog.finishedAt}) filter (where ${SearchMaterializationLog.status} = 'failed')`,
			avgDurationMs24h: sql<
				number | null
			>`round(avg(${SearchMaterializationLog.durationMs}) filter (where ${SearchMaterializationLog.startedAt} >= now() - interval '24 hours' and ${SearchMaterializationLog.durationMs} is not null))`,
			p95DurationMs24h: sql<
				number | null
			>`percentile_disc(0.95) within group (order by ${SearchMaterializationLog.durationMs}) filter (where ${SearchMaterializationLog.startedAt} >= now() - interval '24 hours' and ${SearchMaterializationLog.durationMs} is not null)`,
			rowsMaterialized24h: sql<number>`coalesce(sum(${SearchMaterializationLog.rowsMaterialized}) filter (where ${SearchMaterializationLog.startedAt} >= now() - interval '24 hours'), 0)`,
		})
		.from(SearchMaterializationLog)
		.then((rows) => rows[0])
		.catch(() => null)
	const latestRunRows = await db
		.select({
			status: SearchMaterializationLog.status,
			durationMs: SearchMaterializationLog.durationMs,
			errorMessage: SearchMaterializationLog.errorMessage,
		})
		.from(SearchMaterializationLog)
		.orderBy(sql`${SearchMaterializationLog.createdAt} desc`)
		.limit(1)
		.catch(() => [])
	const latestFailedRows = await db
		.select({
			errorMessage: SearchMaterializationLog.errorMessage,
			finishedAt: SearchMaterializationLog.finishedAt,
		})
		.from(SearchMaterializationLog)
		.where(sql`${SearchMaterializationLog.status} = 'failed'`)
		.orderBy(sql`${SearchMaterializationLog.createdAt} desc`)
		.limit(1)
		.catch(() => [])
	const recentRunsRaw = await listRecentSearchMaterializationLogs(5)

	const totalRows = Number(row?.totalRows ?? 0)
	const staleRows = Number(row?.staleRows ?? 0)
	const freshRows = Math.max(0, totalRows - staleRows)
	const failedRuns24h = Number(logRow?.failedRuns24h ?? 0)
	const latestRun = latestRunRows[0]
	const latestFailed = latestFailedRows[0]

	return {
		ok: staleRows === 0 && failedRuns24h === 0,
		scope: {
			maxLagMinutes,
			staleCutoff: cutoff.toISOString(),
			pastDays,
			futureDays,
		},
		freshness: {
			totalRows,
			freshRows,
			staleRows,
			stalePercent: percent(staleRows, totalRows),
			lastMaterializedAt: asIso(row?.lastMaterializedAt),
			oldestMaterializedAt: asIso(row?.oldestMaterializedAt),
		},
		errors: {
			failedRuns24h,
			lastErrorAt: asIso(latestFailed?.finishedAt ?? logRow?.lastErrorAt),
			lastErrorMessage: latestFailed?.errorMessage ?? null,
			source: "SearchMaterializationLog",
		},
		materialization: {
			lastRunAt: asIso(logRow?.lastRunAt),
			lastStatus: latestRun?.status ?? null,
			lastDurationMs: latestRun?.durationMs == null ? null : Number(latestRun.durationMs),
			avgDurationMs24h: logRow?.avgDurationMs24h == null ? null : Number(logRow.avgDurationMs24h),
			p95DurationMs24h: logRow?.p95DurationMs24h == null ? null : Number(logRow.p95DurationMs24h),
			rowsMaterialized24h: Number(logRow?.rowsMaterialized24h ?? 0),
			runs24h: Number(logRow?.runs24h ?? 0),
			recentRuns: recentRunsRaw.map((run) => ({
				runId: String(run.runId),
				trigger: String(run.trigger),
				status: String(run.status),
				rowsMaterialized: Number(run.rowsMaterialized ?? 0),
				variantsScanned: Number(run.variantsScanned ?? 0),
				durationMs: run.durationMs == null ? null : Number(run.durationMs),
				errorMessage: run.errorMessage ?? null,
				startedAt: asIso(run.startedAt),
				finishedAt: asIso(run.finishedAt),
			})),
		},
	}
}

export async function getSearchFreshnessMonitor(params?: {
	maxLagMinutes?: number
}): Promise<SearchFreshnessMonitor> {
	const maxLagMinutes = Math.max(1, Number(params?.maxLagMinutes ?? 30))
	const pastDays = Math.max(
		0,
		Math.trunc(Number(process.env.FASTT_SEARCH_RETENTION_PAST_DAYS ?? 0))
	)
	const futureDays = Math.max(
		1,
		Math.trunc(Number(process.env.FASTT_SEARCH_RETENTION_FUTURE_DAYS ?? 30))
	)
	const key = cacheKeys.searchFreshnessMonitor(
		`lag:${maxLagMinutes}:past:${pastDays}:future:${futureDays}`
	)
	const cached = await persistentCache.get(key)
	if (cached && typeof cached === "object") {
		return { ...(cached as Omit<SearchFreshnessMonitor, "cacheState">), cacheState: "hit" }
	}
	const monitor = await loadSearchFreshnessMonitor(maxLagMinutes)
	void persistentCache.set(key, monitor, cacheTtls.searchFreshnessMonitor).catch(() => {})
	return { ...monitor, cacheState: "miss" }
}
