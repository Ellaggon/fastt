import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { getPostgresConnectionUrl, type PostgresConnectionMode } from "./env"
import * as schema from "./schema"

type PostgresClientOptions = {
	mode?: PostgresConnectionMode
	max?: number
}

const clients = new Map<string, postgres.Sql>()

function clientKey(options: Required<PostgresClientOptions>) {
	return `${options.mode}:${options.max}`
}

export function createPostgresSqlClient(options: PostgresClientOptions = {}) {
	const resolved = {
		mode: options.mode ?? "runtime",
		max: options.max ?? (options.mode === "direct" ? 1 : 5),
	} satisfies Required<PostgresClientOptions>
	const key = clientKey(resolved)
	const existing = clients.get(key)
	if (existing) return existing

	const sql = postgres(getPostgresConnectionUrl(resolved.mode), {
		max: resolved.max,
		prepare: false,
	})
	clients.set(key, sql)
	return sql
}

export function createPostgresDb(options: PostgresClientOptions = {}) {
	return drizzle(createPostgresSqlClient(options), { schema })
}

let runtimeDb: ReturnType<typeof createPostgresDb> | null = null

export function getRuntimePostgresDb() {
	runtimeDb ??= createPostgresDb({ mode: "runtime" })
	return runtimeDb
}

export const postgresDb = new Proxy({} as ReturnType<typeof createPostgresDb>, {
	get(_target, property, receiver) {
		return Reflect.get(getRuntimePostgresDb(), property, receiver)
	},
	has(_target, property) {
		return property in getRuntimePostgresDb()
	},
})

export async function closePostgresClients() {
	await Promise.all([...clients.values()].map((client) => client.end()))
	clients.clear()
}
