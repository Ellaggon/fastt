import { AsyncLocalStorage } from "node:async_hooks"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { getPostgresConnectionUrl, type PostgresConnectionMode } from "./env"
import { preferIpv4Dns } from "./prefer-ipv4-dns"
import * as schema from "./schema"

type PostgresClientOptions = {
	mode?: PostgresConnectionMode
	max?: number
}

const clients = new Map<string, postgres.Sql>()

function clientKey(options: Required<PostgresClientOptions>) {
	return `${options.mode}:${options.max}`
}

function runtimePoolMax() {
	const configured = Number(process.env.FASTT_POSTGRES_POOL_MAX ?? "")
	if (Number.isFinite(configured) && configured > 0) return Math.min(20, Math.floor(configured))
	// SSR pages fan out several short reads; keep headroom above the old default of 5
	// so background refreshes cannot starve interactive requests on the shared pooler.
	return 10
}

export function createPostgresSqlClient(options: PostgresClientOptions = {}) {
	const resolved = {
		mode: options.mode ?? "runtime",
		max: options.max ?? (options.mode === "direct" ? 1 : runtimePoolMax()),
	} satisfies Required<PostgresClientOptions>
	const key = clientKey(resolved)
	const existing = clients.get(key)
	if (existing) return existing

	preferIpv4Dns()
	const sql = postgres(getPostgresConnectionUrl(resolved.mode), {
		max: resolved.max,
		prepare: false,
		idle_timeout: 20,
		max_lifetime: 60 * 30,
		connect_timeout: 15,
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

type RuntimeDb = ReturnType<typeof createPostgresDb>
type TransactionContext = { executor: RuntimeDb; afterCommit: Array<() => Promise<void>> }
const transactionContext = new AsyncLocalStorage<TransactionContext>()

export function isInPostgresTransaction() {
	return Boolean(transactionContext.getStore())
}

/** Joins a caller's unit of work; all compatibility repositories share this connection. */
export async function withPostgresTransaction<T>(
	work: () => Promise<T>,
	options?: { savepoint?: boolean }
): Promise<T> {
	const parent = transactionContext.getStore()
	if (parent && !options?.savepoint) return work()
	const afterCommit: TransactionContext["afterCommit"] = []
	const executor = parent?.executor ?? getRuntimePostgresDb()
	const result = await executor.transaction(
		(tx) => transactionContext.run({ executor: tx as unknown as RuntimeDb, afterCommit }, work),
		parent ? undefined : { isolationLevel: "repeatable read" }
	)
	if (parent) parent.afterCommit.push(...afterCommit)
	else await Promise.allSettled(afterCommit.map((effect) => Promise.resolve().then(effect)))
	return result
}

export async function afterPostgresCommit(effect: () => Promise<void>): Promise<void> {
	const context = transactionContext.getStore()
	if (context) context.afterCommit.push(effect)
	else await effect()
}

export const postgresDb = new Proxy({} as RuntimeDb, {
	get(_target, property) {
		const executor = transactionContext.getStore()?.executor ?? getRuntimePostgresDb()
		const value = Reflect.get(executor, property)
		return typeof value === "function" ? value.bind(executor) : value
	},
	has(_target, property) {
		return property in (transactionContext.getStore()?.executor ?? getRuntimePostgresDb())
	},
})

export async function closePostgresClients() {
	await Promise.all([...clients.values()].map((client) => client.end()))
	clients.clear()
}
