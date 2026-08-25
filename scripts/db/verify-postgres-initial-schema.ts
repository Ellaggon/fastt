import "dotenv/config"

import { getTableColumns } from "drizzle-orm"
import postgres from "postgres"

import { canonicalDatabaseTables } from "../../src/shared/infrastructure/db/schema/canonical-schema"

type ColumnRow = {
	table_name: string
	column_name: string
	data_type: string
	is_nullable: "YES" | "NO"
}

type SchemaColumn = {
	name: string
	notNull: boolean
	getSQLType(): string
}

// The migration runner owns this ledger outside Drizzle's domain schema. It is
// created lazily when the first tracked migration is applied and is never a
// business table or a fresh-install requirement.
const operationalInfrastructureTables = new Set(["fastt_schema_migrations"])

function baseSqlType(column: SchemaColumn) {
	return column.getSQLType().replace(/\(.+\)$/, "")
}

function requireDirectUrl() {
	const value = process.env.DIRECT_URL?.trim()
	if (!value) throw new Error("Missing required env DIRECT_URL")
	return value
}

function argValue(name: string) {
	const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
	if (inline) return inline.slice(name.length + 1)
	const index = process.argv.indexOf(name)
	return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
	const fresh = process.argv.includes("--fresh")
	const sql = postgres(requireDirectUrl(), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})

	try {
		const allExpected = canonicalDatabaseTables()
		const selectedNames = argValue("--tables")
			?.split(",")
			.map((name) => name.trim())
			.filter(Boolean)
		const knownNames = new Set(allExpected.map(({ name }) => name))
		const unknownNames = selectedNames?.filter((name) => !knownNames.has(name)) ?? []
		if (unknownNames.length) {
			throw new Error(`Unknown canonical table(s): ${unknownNames.join(", ")}`)
		}
		const expected = selectedNames
			? allExpected.filter(({ name }) => selectedNames.includes(name))
			: allExpected
		const expectedNames = new Set(expected.map(({ name }) => name))
		const expectedColumns = new Map(
			expected.map(({ name, table }) => [
				name,
				new Map(
					Object.values(getTableColumns(table) as Record<string, SchemaColumn>).map((column) => [
						column.name,
						{ sqlType: baseSqlType(column), notNull: column.notNull },
					])
				),
			])
		)
		const rows = selectedNames
			? await sql<ColumnRow[]>`
				select table_name, column_name, data_type, is_nullable
				from information_schema.columns
				where table_schema = 'public' and table_name = any(${selectedNames})
				order by table_name, ordinal_position
			`
			: await sql<ColumnRow[]>`
				select table_name, column_name, data_type, is_nullable
				from information_schema.columns
				where table_schema = 'public'
				order by table_name, ordinal_position
			`
		const actualColumns = new Map<string, Map<string, ColumnRow>>()
		for (const row of rows) {
			const columns = actualColumns.get(row.table_name) ?? new Map<string, ColumnRow>()
			columns.set(row.column_name, row)
			actualColumns.set(row.table_name, columns)
		}

		const actualNames = new Set(actualColumns.keys())
		const operationalTables = [...actualNames].filter((name) =>
			operationalInfrastructureTables.has(name)
		)
		const managedActualNames = new Set(
			[...actualNames].filter((name) => !operationalInfrastructureTables.has(name))
		)
		const missingTables = [...expectedNames].filter((name) => !managedActualNames.has(name))
		const unmanagedTables = [...managedActualNames].filter((name) => !expectedNames.has(name))
		const columnDrift = expected.flatMap(({ name }) => {
			const expectedForTable = expectedColumns.get(name) ?? new Map()
			const actualForTable = actualColumns.get(name) ?? new Map()
			const missing = [...expectedForTable.keys()].filter((column) => !actualForTable.has(column))
			const unexpected = [...actualForTable.keys()].filter(
				(column) => !expectedForTable.has(column)
			)
			return missing.length || unexpected.length ? [{ table: name, missing, unexpected }] : []
		})
		const definitionDrift = expected.flatMap(({ name }) => {
			const expectedForTable = expectedColumns.get(name) ?? new Map()
			const actualForTable = actualColumns.get(name) ?? new Map()
			return [...expectedForTable.entries()].flatMap(([columnName, expectedColumn]) => {
				const actualColumn = actualForTable.get(columnName)
				if (
					!actualColumn ||
					(actualColumn.data_type === expectedColumn.sqlType &&
						(actualColumn.is_nullable === "NO") === expectedColumn.notNull)
				) {
					return []
				}
				return [
					{
						table: name,
						column: columnName,
						expectedType: expectedColumn.sqlType,
						actualType: actualColumn.data_type,
						expectedNotNull: expectedColumn.notNull,
						actualNotNull: actualColumn.is_nullable === "NO",
					},
				]
			})
		})

		const report = {
			phase: "postgres-initial-schema",
			mode: fresh ? "fresh-install" : "operational-audit",
			scope: selectedNames ?? "all",
			ready:
				missingTables.length === 0 &&
				columnDrift.length === 0 &&
				definitionDrift.length === 0 &&
				(!fresh || unmanagedTables.length === 0),
			expectedTableCount: expected.length,
			actualTableCount: managedActualNames.size,
			operationalTables,
			missingTables,
			unmanagedTables,
			columnDrift,
			definitionDrift,
		}
		console.log(JSON.stringify(report, null, 2))
		if (!report.ready) {
			throw new Error(
				fresh
					? "Fresh PostgreSQL installation does not match the canonical Drizzle schema."
					: "Operational PostgreSQL database is missing canonical tables or columns."
			)
		}
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
