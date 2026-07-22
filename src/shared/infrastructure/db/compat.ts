import { sql as drizzleSql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { getRuntimePostgresDb } from "./client"
export * from "drizzle-orm"
export * from "./schema"

type QueryLike<T = unknown> = PromiseLike<T> & {
	all?: () => Promise<T>
	get?: () => Promise<unknown>
	run?: () => Promise<unknown>
}

type DbLike = {
	execute?: (query: unknown) => Promise<unknown>
	run?: (query: unknown) => Promise<unknown>
	transaction?: <T>(callback: (tx: DbLike) => Promise<T>) => Promise<T>
	[key: string]: unknown
}

type RuntimePostgresDb = ReturnType<typeof getRuntimePostgresDb>
type AstroDbCompat = RuntimePostgresDb & {
	run: (...args: any[]) => Promise<any>
	transaction: RuntimePostgresDb["transaction"]
}

let compatInstalled = false

function installQueryCompat() {
	if (compatInstalled) return
	compatInstalled = true

	const sql = postgres("postgres://fastt:fastt@127.0.0.1:5432/fastt_compat", {
		max: 1,
		prepare: false,
	})
	const sampleDb = drizzle(sql)
	const builders = [
		sampleDb.select(),
		sampleDb.insert({} as never),
		sampleDb.update({} as never),
		sampleDb.delete({} as never),
	]

	for (const builder of builders) {
		const prototype = Object.getPrototypeOf(builder) as QueryLike
		if (!prototype.all) {
			prototype.all = async function all(this: QueryLike) {
				return this as unknown as Promise<unknown>
			}
		}
		if (!prototype.get) {
			prototype.get = async function get(this: QueryLike<unknown[]>) {
				const rows = await this
				return Array.isArray(rows) ? rows[0] : rows
			}
		}
		if (!prototype.run) {
			prototype.run = async function run(this: QueryLike) {
				return this as unknown as Promise<unknown>
			}
		}
	}

	void sql.end({ timeout: 0 })
}

function withDbCompat<T extends DbLike>(target: T): T {
	return new Proxy(target, {
		get(current, property, receiver) {
			if (property === "run") {
				return (query: unknown) => {
					if (!current.execute) throw new Error("Postgres DB execute() is not available.")
					return current.execute(query)
				}
			}
			if (property === "transaction") {
				return async <TResult>(callback: (tx: DbLike) => Promise<TResult>) => {
					if (!current.transaction) throw new Error("Postgres DB transaction() is not available.")
					return current.transaction((tx) => callback(withDbCompat(tx)))
				}
			}
			return Reflect.get(current, property, receiver)
		},
	}) as T
}

installQueryCompat()

const lazyRuntimeDb = new Proxy({} as DbLike, {
	get(_target, property, receiver) {
		return Reflect.get(getRuntimePostgresDb() as unknown as DbLike, property, receiver)
	},
	has(_target, property) {
		return property in (getRuntimePostgresDb() as unknown as DbLike)
	},
})

export const db = withDbCompat(lazyRuntimeDb) as unknown as AstroDbCompat
export const sql = drizzleSql

export function first<T>(rows: readonly T[]): T | undefined {
	return rows[0]
}
