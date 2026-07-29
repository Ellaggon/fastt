import { sql as drizzleSql } from "drizzle-orm"

import { postgresDb } from "./client"

export * from "drizzle-orm"
export * from "./schema"

export const db = postgresDb
export const sql = drizzleSql

export function first<T>(rows: readonly T[]): T | undefined {
	return rows[0]
}
