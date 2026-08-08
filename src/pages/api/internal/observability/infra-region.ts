import type { APIRoute } from "astro"
import { createPostgresSqlClient } from "@/shared/infrastructure/db/client"
import { readPostgresDatabaseEnv } from "@/shared/infrastructure/db/env"
import {
	isInternalObservabilityAuthorized,
	unauthorizedObservabilityResponse,
} from "@/lib/observability/internalObservabilityAuth"
import { currentRegion } from "@/lib/observability/requestContext"
import * as persistentCache from "@/lib/cache/persistentCache"
import { readThrough } from "@/lib/cache/readThrough"

function nowMs() {
	return performance.now()
}

function durationSince(startedAt: number) {
	return Number((performance.now() - startedAt).toFixed(1))
}

function hasRuntimePoolerHost(value: string | null) {
	return Boolean(value && value.includes(".pooler.supabase.com"))
}

async function measurePostgres() {
	const startedAt = nowMs()
	try {
		const sql = createPostgresSqlClient({ mode: "runtime", max: 1 })
		const rows = await sql<{ now: Date; server_addr: string | null; server_port: number | null }[]>`
			select now() as now, inet_server_addr()::text as server_addr, inet_server_port() as server_port
		`
		const row = rows[0]
		return {
			ok: true,
			durationMs: durationSince(startedAt),
			serverTime: row?.now?.toISOString?.() ?? null,
			serverAddr: row?.server_addr ?? null,
			serverPort: row?.server_port ?? null,
		}
	} catch (error) {
		return {
			ok: false,
			durationMs: durationSince(startedAt),
			error: error instanceof Error ? error.message.slice(0, 160) : "postgres_failed",
		}
	}
}

async function measureRedis() {
	const key = `infra:region:${crypto.randomUUID()}`
	const startedAt = nowMs()
	try {
		const connection = await persistentCache.verifyRuntimeConnection()
		let calculations = 0
		const first = await readThrough(key, 15, async () => {
			calculations += 1
			return { ok: true, at: Date.now() }
		})
		const second = await readThrough(key, 15, async () => {
			calculations += 1
			return { ok: true, at: Date.now() }
		})
		const runtime = await persistentCache.getRuntimeStatus()
		await persistentCache.del(key)
		return {
			ok: Boolean(connection.ok && first && second && calculations === 1),
			durationMs: durationSince(startedAt),
			calculations,
			connection,
			...runtime,
		}
	} catch (error) {
		const runtime = await persistentCache.getRuntimeStatus()
		return {
			ok: false,
			durationMs: durationSince(startedAt),
			...runtime,
			error: error instanceof Error ? error.message.slice(0, 160) : "redis_failed",
		}
	}
}

export const GET: APIRoute = async ({ request }) => {
	if (!isInternalObservabilityAuthorized(request)) {
		return unauthorizedObservabilityResponse()
	}

	const dbEnv = readPostgresDatabaseEnv()
	const [postgres, redis] = await Promise.all([measurePostgres(), measureRedis()])
	const region = currentRegion()
	const payload = {
		region,
		vercelRegion: process.env.VERCEL_REGION ?? null,
		fasttRegion: process.env.FASTT_REGION ?? null,
		nodeEnv: process.env.NODE_ENV ?? null,
		database: {
			runtimeUsesPooler: hasRuntimePoolerHost(dbEnv.runtimeUrl),
			hasDirectUrl: Boolean(dbEnv.directUrl),
			hasPoolerUrl: Boolean(dbEnv.poolerUrl),
			postgres,
		},
		cache: redis,
	}

	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			"X-Fastt-Region": region,
		},
	})
}
