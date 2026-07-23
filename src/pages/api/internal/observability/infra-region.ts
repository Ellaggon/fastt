import type { APIRoute } from "astro"
import { createPostgresSqlClient } from "@/shared/infrastructure/db/client"
import { readPostgresDatabaseEnv } from "@/shared/infrastructure/db/env"
import { currentRegion } from "@/lib/observability/requestContext"
import * as persistentCache from "@/lib/cache/persistentCache"

function nowMs() {
	return performance.now()
}

function durationSince(startedAt: number) {
	return Number((performance.now() - startedAt).toFixed(1))
}

function hasRuntimePoolerHost(value: string | null) {
	return Boolean(value && value.includes(".pooler.supabase.com"))
}

function isAuthorized(request: Request) {
	const token = process.env.FASTT_INFRA_HEALTH_TOKEN?.trim()
	if (!token) return process.env.NODE_ENV !== "production"
	const header = request.headers.get("authorization") ?? ""
	const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
	return bearer === token
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
		await persistentCache.set(key, { ok: true, at: Date.now() }, 15)
		const value = await persistentCache.get(key)
		await persistentCache.del(key)
		return {
			ok: Boolean(value),
			durationMs: durationSince(startedAt),
			driverConfigured: Boolean(
				process.env.REDIS_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim()
			),
		}
	} catch (error) {
		return {
			ok: false,
			durationMs: durationSince(startedAt),
			driverConfigured: Boolean(
				process.env.REDIS_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim()
			),
			error: error instanceof Error ? error.message.slice(0, 160) : "redis_failed",
		}
	}
}

export const GET: APIRoute = async ({ request }) => {
	if (!isAuthorized(request)) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		})
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
