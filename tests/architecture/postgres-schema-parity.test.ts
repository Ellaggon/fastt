import { existsSync, readFileSync } from "node:fs"

import { getTableColumns, getTableName, type Table } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { databaseTableNames } from "@/shared/infrastructure/db/schema/registry"
import * as schema from "@/shared/infrastructure/db/schema/tables"

function baselineTables() {
	const sql = readFileSync("db/postgres/0001_initial_schema.sql", "utf8")
	const tables = new Map<string, string[]>()
	const pattern = /CREATE TABLE "([^"]+)" \(\n([\s\S]*?)\n\);/g

	for (const match of sql.matchAll(pattern)) {
		const columns = match[2]
			.split("\n")
			.map((line) => line.trim().match(/^"([^"]+)"\s/)?.[1])
			.filter((column): column is string => Boolean(column))
		tables.set(match[1], columns)
	}

	return tables
}

describe("PostgreSQL canonical schema parity", () => {
	it("does not restore db/config.ts after the Astro DB retirement", () => {
		expect(existsSync("db/config.ts")).toBe(false)
	})

	it("keeps every baseline table and column aligned with the Drizzle schema", () => {
		const baseline = baselineTables()
		expect([...baseline.keys()].sort()).toEqual([...databaseTableNames].sort())

		for (const tableName of databaseTableNames) {
			const table = (schema as unknown as Record<string, Table>)[tableName]
			expect(table, `Missing schema export ${tableName}`).toBeTruthy()
			const expectedColumns = Object.values(getTableColumns(table))
				.map((column) => column.name)
				.sort()
			expect(baseline.get(tableName)?.sort(), tableName).toEqual(expectedColumns)
		}
	})

	it("registers every exported Drizzle table in the canonical baseline", () => {
		const exportedTables = new Set<string>()
		for (const value of Object.values(schema)) {
			if (!value || typeof value !== "object") continue
			try {
				if (Object.keys(getTableColumns(value as Table)).length > 0) {
					exportedTables.add(getTableName(value as Table))
				}
			} catch {
				// Ignore runtime exports that are not Drizzle tables.
			}
		}

		expect([...databaseTableNames].sort()).toEqual([...exportedTables].sort())
	})
})
