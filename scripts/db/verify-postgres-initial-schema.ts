import "dotenv/config"

import postgres from "postgres"

import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"
import { databaseTableNames } from "../../src/shared/infrastructure/db/schema/registry"
import * as schema from "../../src/shared/infrastructure/db/schema/tables"

type DrizzleTable = Record<string | symbol, unknown>
type DrizzleColumn = { name: string }

function drizzleSymbol(target: object, marker: string): symbol {
	const symbol = Object.getOwnPropertySymbols(target).find((candidate) =>
		String(candidate).includes(marker)
	)
	if (!symbol) throw new Error(`Missing Drizzle symbol ${marker}`)
	return symbol
}

function tableColumns(table: DrizzleTable): DrizzleColumn[] {
	return Object.values(table[drizzleSymbol(table, "Columns")] as Record<string, DrizzleColumn>)
}

function tableName(table: DrizzleTable): string {
	return table[drizzleSymbol(table, "Name")] as string
}

function canonicalInventory() {
	const tables = new Map<string, { name: string; columns: string[] }>()
	for (const value of Object.values(schema)) {
		if (!value || typeof value !== "object") continue
		try {
			const table = value as unknown as DrizzleTable
			const name = tableName(table)
			const columns = tableColumns(table)
				.map((column) => column.name)
				.sort()
			if (columns.length > 0) tables.set(name, { name, columns })
		} catch {
			// tables.ts also exports type-adjacent runtime values; Drizzle tables carry both symbols.
		}
	}

	const exportedNames = [...tables.keys()].sort()
	const registeredNames = [...databaseTableNames].sort()
	const missingFromRegistry = exportedNames.filter((name) => !registeredNames.includes(name))
	const unknownInRegistry = registeredNames.filter((name) => !exportedNames.includes(name))
	if (missingFromRegistry.length || unknownInRegistry.length) {
		throw new Error(
			`Schema registry drift. Missing: ${missingFromRegistry.join(", ") || "none"}. Unknown: ${unknownInRegistry.join(", ") || "none"}.`
		)
	}

	return [...tables.values()].sort((left, right) => left.name.localeCompare(right.name))
}

async function main() {
	const sql = postgres(getPostgresConnectionUrl("direct"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})
	try {
		const expected = canonicalInventory()
		const actualTables = new Set(
			(
				await sql<{ table_name: string }[]>`
					select table_name
					from information_schema.tables
					where table_schema = 'public' and table_type = 'BASE TABLE'
				`
			).map((row) => row.table_name)
		)
		const actualColumns = await sql<{ table_name: string; column_name: string }[]>`
			select table_name, column_name
			from information_schema.columns
			where table_schema = 'public'
		`
		const columnsByTable = new Map<string, Set<string>>()
		for (const row of actualColumns) {
			const columns = columnsByTable.get(row.table_name) ?? new Set<string>()
			columns.add(row.column_name)
			columnsByTable.set(row.table_name, columns)
		}

		const missingTables = expected
			.filter((table) => !actualTables.has(table.name))
			.map((table) => table.name)
		const missingColumns = expected.flatMap((table) => {
			const actual = columnsByTable.get(table.name) ?? new Set<string>()
			return table.columns
				.filter((column) => !actual.has(column))
				.map((column) => `${table.name}.${column}`)
		})
		const unexpectedTables = process.argv.includes("--fresh")
			? [...actualTables].filter((name) => !expected.some((table) => table.name === name)).sort()
			: []
		const ready =
			missingTables.length === 0 && missingColumns.length === 0 && unexpectedTables.length === 0

		console.log(
			JSON.stringify(
				{ ready, expectedTables: expected.length, missingTables, missingColumns, unexpectedTables },
				null,
				2
			)
		)
		if (!ready)
			throw new Error("PostgreSQL initial schema does not match the canonical Drizzle inventory.")
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
