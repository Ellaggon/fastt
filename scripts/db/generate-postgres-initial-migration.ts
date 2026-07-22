import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import * as schema from "../../src/shared/infrastructure/db/schema/tables"
import { databaseTableNames } from "../../src/shared/infrastructure/db/schema/registry"

const OUT_FILE = "db/postgres/0001_initial_schema.sql"
const INTEGRITY_FILE = "src/shared/infrastructure/db/schema/postgres-integrity.sql"

type DrizzleTable = Record<string | symbol, unknown>
type DrizzleColumn = {
	name: string
	columnType: string
	notNull: boolean
	primary: boolean
	hasDefault: boolean
	default: unknown
	config?: {
		precision?: number
		scale?: number
		withTimezone?: boolean
	}
}

function drizzleSymbol(target: object, marker: string): symbol {
	const symbol = Object.getOwnPropertySymbols(target).find((candidate) =>
		String(candidate).includes(marker)
	)
	if (!symbol) throw new Error(`Missing Drizzle symbol ${marker}`)
	return symbol
}

function q(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`
}

function literal(value: unknown): string {
	if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`
	if (typeof value === "number") return String(value)
	if (typeof value === "boolean") return value ? "true" : "false"
	return "NULL"
}

function defaultSql(value: unknown): string | null {
	if (value == null) return null
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return literal(value)
	}
	const asText = String(value)
	if (asText.includes("now()")) return "now()"
	return null
}

function tableName(table: DrizzleTable): string {
	return table[drizzleSymbol(table, "Name")] as string
}

function tableColumns(table: DrizzleTable): DrizzleColumn[] {
	const columns = table[drizzleSymbol(table, "Columns")] as Record<string, DrizzleColumn>
	return Object.values(columns)
}

function columnType(column: DrizzleColumn): string {
	switch (column.columnType) {
		case "PgText":
			return "text"
		case "PgInteger":
			return "integer"
		case "PgBoolean":
			return "boolean"
		case "PgReal":
			return "real"
		case "PgJsonb":
			return "jsonb"
		case "PgDate":
		case "PgDateString":
			return "date"
		case "PgTimestamp":
			return column.config?.withTimezone
				? "timestamp with time zone"
				: "timestamp without time zone"
		case "PgNumeric": {
			const precision = column.config?.precision
			const scale = column.config?.scale
			return precision && scale != null ? `numeric(${precision}, ${scale})` : "numeric"
		}
		default:
			throw new Error(`Unsupported Postgres column type ${column.columnType} for ${column.name}`)
	}
}

function columnDefinition(column: DrizzleColumn): string {
	const parts = [q(column.name), columnType(column)]
	if (column.primary) parts.push("PRIMARY KEY")
	if (column.notNull && !column.primary) parts.push("NOT NULL")
	const sqlDefault =
		defaultSql(column.default) ??
		(column.hasDefault && column.columnType === "PgTimestamp" ? "now()" : null)
	if (column.hasDefault && sqlDefault) parts.push("DEFAULT", sqlDefault)
	return parts.join(" ")
}

function createTableSql(table: DrizzleTable): string {
	const body = tableColumns(table)
		.map((column) => `\t${columnDefinition(column)}`)
		.join(",\n")
	return `CREATE TABLE ${q(tableName(table))} (\n${body}\n);`
}

function foreignKeySql(table: DrizzleTable): string[] {
	const tableFkSymbol = drizzleSymbol(table, "PgInlineForeignKeys")
	const foreignKeys =
		(table[tableFkSymbol] as Array<{
			reference: () => {
				columns: DrizzleColumn[]
				foreignTable: DrizzleTable
				foreignColumns: DrizzleColumn[]
			}
			onUpdate?: string
			onDelete?: string
		}>) ?? []

	return foreignKeys.map((foreignKey) => {
		const reference = foreignKey.reference()
		const sourceTable = tableName(table)
		const targetTable = tableName(reference.foreignTable)
		const sourceColumns = reference.columns.map((column) => column.name)
		const targetColumns = reference.foreignColumns.map((column) => column.name)
		const name = `${sourceTable}_${sourceColumns.join("_")}_fk`
		const actions = [
			foreignKey.onDelete && foreignKey.onDelete !== "no action"
				? `ON DELETE ${foreignKey.onDelete.toUpperCase()}`
				: null,
			foreignKey.onUpdate && foreignKey.onUpdate !== "no action"
				? `ON UPDATE ${foreignKey.onUpdate.toUpperCase()}`
				: null,
		].filter(Boolean)

		return [
			`ALTER TABLE ${q(sourceTable)}`,
			`\tADD CONSTRAINT ${q(name)}`,
			`\tFOREIGN KEY (${sourceColumns.map(q).join(", ")})`,
			`\tREFERENCES ${q(targetTable)} (${targetColumns.map(q).join(", ")})`,
			actions.length > 0 ? `\t${actions.join(" ")}` : null,
			";",
		]
			.filter(Boolean)
			.join("\n")
	})
}

function indexSql(table: DrizzleTable): string[] {
	const builder = table[drizzleSymbol(table, "ExtraConfigBuilder")] as
		| ((
				columns: unknown
		  ) => Array<{ config: { name: string; unique?: boolean; columns: { name: string }[] } }>)
		| undefined
	if (!builder) return []
	const columns = table[drizzleSymbol(table, "ExtraConfigColumns")]
	return builder(columns).map((index) => {
		const uniqueness = index.config.unique ? "UNIQUE " : ""
		const columnList = index.config.columns.map((column) => q(column.name)).join(", ")
		return `CREATE ${uniqueness}INDEX ${q(index.config.name)} ON ${q(tableName(table))} (${columnList});`
	})
}

async function main() {
	const tables = databaseTableNames.map((name) => {
		const table = (schema as unknown as Record<string, DrizzleTable>)[name]
		if (!table) throw new Error(`Schema export not found for ${name}`)
		return table
	})

	const integritySql = await readFile(INTEGRITY_FILE, "utf8")
	const lines = [
		"-- Fastt Supabase initial schema.",
		"-- Generated from src/shared/infrastructure/db/schema/tables.ts.",
		"-- Do not reuse SQLite/Turso migration history for this baseline.",
		"",
		"BEGIN;",
		"",
		...tables.map(createTableSql),
		"",
		...tables.flatMap(foreignKeySql),
		"",
		...tables.flatMap(indexSql),
		"",
		"-- Native PostgreSQL constraints, partial indexes and triggers.",
		integritySql.trim(),
		"",
		"COMMIT;",
		"",
	]

	await mkdir(path.dirname(OUT_FILE), { recursive: true })
	await writeFile(OUT_FILE, lines.join("\n\n"))
	console.log(`Generated ${OUT_FILE} from ${tables.length} tables.`)
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
