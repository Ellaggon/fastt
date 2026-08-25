import { getTableColumns, getTableName, type Table } from "drizzle-orm"

import * as schema from "./tables"

export type CanonicalDatabaseTable = {
	name: string
	table: Table
}

/**
 * The Drizzle exports are the authoritative inventory of persistent tables.
 * Domain registries classify those tables; they never decide which tables an
 * installation receives.
 */
export function canonicalDatabaseTables(): CanonicalDatabaseTable[] {
	const tables = new Map<string, Table>()

	for (const value of Object.values(schema)) {
		if (!value || typeof value !== "object") continue
		try {
			const table = value as Table
			if (Object.keys(getTableColumns(table)).length > 0) {
				tables.set(getTableName(table), table)
			}
		} catch {
			// tables.ts also exports aliases and helpers. Only Drizzle tables participate.
		}
	}

	return [...tables.entries()]
		.map(([name, table]) => ({ name, table }))
		.sort((left, right) => left.name.localeCompare(right.name))
}

export function canonicalDatabaseTableNames(): string[] {
	return canonicalDatabaseTables().map(({ name }) => name)
}
