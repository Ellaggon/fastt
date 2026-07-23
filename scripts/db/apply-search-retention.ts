import { randomUUID } from "node:crypto"

import "dotenv/config"

import postgres from "postgres"

type QuerySql = postgres.Sql | postgres.TransactionSql

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`Missing required env ${name}`)
	return value
}

function hasFlag(name: string): boolean {
	return process.argv.includes(name)
}

function numberFromEnv(name: string, fallback: number): number {
	const value = Number(process.env[name] ?? fallback)
	return Number.isFinite(value) ? value : fallback
}

async function summarize(sql: QuerySql) {
	const [row] = await sql`
		select
			count(*)::int as total,
			count(*) filter (where date < current_date)::int as past,
			count(*) filter (
				where date >= current_date
					and date < current_date + interval '30 days'
			)::int as next30,
			count(*) filter (
				where date >= current_date
					and date < current_date + interval '30 days'
					and "computedAt" < now() - interval '24 hours'
			)::int as staleNext30,
			count(*) filter (
				where date >= current_date + interval '30 days'
			)::int as beyond30,
			min(date)::text as "minDate",
			max(date)::text as "maxDate",
			max("computedAt") as "lastComputedAt"
		from "SearchUnitView"
	`
	return row
}

async function previewDeletion(
	sql: QuerySql,
	params: { pastDays: number; futureDays: number; staleHours: number }
) {
	const [row] = await sql`
		select
			count(*)::int as rows,
			count(*) filter (
				where date < current_date - (${params.pastDays}::int * interval '1 day')
			)::int as pastRows,
			count(*) filter (
				where date >= current_date + (${params.futureDays}::int * interval '1 day')
			)::int as beyondFutureRows,
			count(*) filter (
				where date >= current_date - (${params.pastDays}::int * interval '1 day')
					and date < current_date + (${params.futureDays}::int * interval '1 day')
					and "computedAt" < now() - (${params.staleHours}::int * interval '1 hour')
			)::int as staleRows
		from "SearchUnitView"
		where date < current_date - (${params.pastDays}::int * interval '1 day')
			or date >= current_date + (${params.futureDays}::int * interval '1 day')
			or (
				date >= current_date - (${params.pastDays}::int * interval '1 day')
				and date < current_date + (${params.futureDays}::int * interval '1 day')
				and "computedAt" < now() - (${params.staleHours}::int * interval '1 hour')
			)
	`
	return row
}

async function applyRetention(
	sql: QuerySql,
	params: { pastDays: number; futureDays: number; staleHours: number }
) {
	const rows = await sql`
		delete from "SearchUnitView"
		where date < current_date - (${params.pastDays}::int * interval '1 day')
			or date >= current_date + (${params.futureDays}::int * interval '1 day')
			or (
				date >= current_date - (${params.pastDays}::int * interval '1 day')
				and date < current_date + (${params.futureDays}::int * interval '1 day')
				and "computedAt" < now() - (${params.staleHours}::int * interval '1 hour')
			)
		returning id
	`
	return rows.length
}

async function recordRetentionLog(
	sql: QuerySql,
	params: {
		runId: string
		purgedRows: number
		durationMs: number
		pastDays: number
		futureDays: number
		staleHours: number
		startedAt: Date
	}
) {
	await sql`
		insert into "SearchMaterializationLog" (
			id,
			"runId",
			trigger,
			status,
			"horizonDays",
			"variantsScanned",
			"rowsMaterialized",
			"purgedRows",
			"durationMs",
			"metadataJson",
			"startedAt",
			"finishedAt",
			"createdAt"
		)
		values (
			${params.runId},
			${params.runId},
			'search_unit_view_retention',
			'completed',
			${params.futureDays},
			0,
			0,
			${params.purgedRows},
			${Math.round(params.durationMs)},
			jsonb_build_object(
				'pastDays', ${params.pastDays}::int,
				'futureDays', ${params.futureDays}::int,
				'staleHours', ${params.staleHours}::int,
				'policy', 'SearchUnitView is an ephemeral operational read model. Booking/search audit must live in domain snapshots/logs, not stale search rows.'
			),
			${params.startedAt},
			now(),
			now()
		)
		on conflict ("runId") do update set
			status = excluded.status,
			"purgedRows" = excluded."purgedRows",
			"durationMs" = excluded."durationMs",
			"metadataJson" = excluded."metadataJson",
			"finishedAt" = excluded."finishedAt"
	`
}

async function main() {
	const dryRun = hasFlag("--dry-run") || process.env.FASTT_SEARCH_RETENTION_DRY_RUN === "1"
	const pastDays = Math.max(0, Math.trunc(numberFromEnv("FASTT_SEARCH_RETENTION_PAST_DAYS", 0)))
	const futureDays = Math.max(
		1,
		Math.trunc(numberFromEnv("FASTT_SEARCH_RETENTION_FUTURE_DAYS", 30))
	)
	const staleHours = Math.max(
		1,
		Math.trunc(numberFromEnv("FASTT_SEARCH_RETENTION_STALE_HOURS", 24))
	)
	const startedAt = performance.now()
	const startedAtDate = new Date()
	const runId = `search_retention_${startedAtDate.toISOString()}_${randomUUID()}`

	const db = postgres(requireEnv("DIRECT_URL"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})

	try {
		const before = await summarize(db)
		const deletionPreview = await previewDeletion(db, { pastDays, futureDays, staleHours })
		const purgedRows = dryRun
			? 0
			: await db.begin((sql) => applyRetention(sql, { pastDays, futureDays, staleHours }))
		const after = await summarize(db)
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		const purgedRowsOverride = process.env.FASTT_SEARCH_RETENTION_PURGED_ROWS_OVERRIDE
		const purgedRowsForLog =
			purgedRowsOverride == null ? purgedRows : Math.max(0, Math.trunc(Number(purgedRowsOverride)))
		if (!dryRun) {
			await recordRetentionLog(db, {
				runId,
				purgedRows: purgedRowsForLog,
				durationMs,
				pastDays,
				futureDays,
				staleHours,
				startedAt: startedAtDate,
			})
		}
		console.log(
			JSON.stringify(
				{
					ok: true,
					dryRun,
					runId: dryRun ? null : runId,
					policy: {
						pastDays,
						futureDays,
						staleHours,
					},
					durationMs,
					before,
					deletionPreview,
					purgedRows,
					purgedRowsForLog,
					after,
				},
				null,
				2
			)
		)
	} finally {
		await db.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
