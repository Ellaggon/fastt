import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { PgDialect } from "drizzle-orm/pg-core"

import * as schema from "../../src/shared/infrastructure/db/schema/tables"
import { canonicalDatabaseTableNames } from "../../src/shared/infrastructure/db/schema/canonical-schema"
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
	generated?: {
		as: unknown
		type: string
		mode: string
	}
	config?: {
		precision?: number
		scale?: number
		withTimezone?: boolean
	}
}

type ExtraConfigItem = {
	constructor?: { name?: string }
	config?: {
		name: string
		unique?: boolean
		columns: { name: string }[]
		where?: unknown
	}
	name?: string
	value?: unknown
	columns?: { name: string }[]
	nullsNotDistinctConfig?: boolean
}

const dialect = new PgDialect()

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

function assertRegistryCoversSchema() {
	const exported = canonicalDatabaseTableNames()
	const registered = [...databaseTableNames].sort()
	const missing = exported.filter((name) => !registered.includes(name))
	const unknown = registered.filter((name) => !exported.includes(name))
	if (missing.length || unknown.length) {
		throw new Error(
			`Schema registry drift. Missing: ${missing.join(", ") || "none"}. Unknown: ${unknown.join(", ") || "none"}.`
		)
	}
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
		case "PgNumeric":
		case "PgNumericNumber": {
			const precision = column.config?.precision
			const scale = column.config?.scale
			return precision && scale != null ? `numeric(${precision}, ${scale})` : "numeric"
		}
		default:
			throw new Error(`Unsupported Postgres column type ${column.columnType} for ${column.name}`)
	}
}

function columnDefinition(column: DrizzleColumn, sourceTable: string): string {
	const parts = [q(column.name), columnType(column)]
	if (column.generated) {
		const expression = renderExpression(column.generated.as, sourceTable)
		parts.push(`GENERATED ALWAYS AS (${expression}) ${column.generated.mode.toUpperCase()}`)
		return parts.join(" ")
	}
	if (column.primary) parts.push("PRIMARY KEY")
	if (column.notNull && !column.primary) parts.push("NOT NULL")
	const sqlDefault =
		defaultSql(column.default) ??
		(column.hasDefault && column.columnType === "PgTimestamp" ? "now()" : null)
	if (column.hasDefault && sqlDefault) parts.push("DEFAULT", sqlDefault)
	return parts.join(" ")
}

function createTableSql(table: DrizzleTable): string {
	const sourceTable = tableName(table)
	const body = tableColumns(table)
		.map((column) => `\t${columnDefinition(column, sourceTable)}`)
		.join(",\n")
	return `CREATE TABLE ${q(sourceTable)} (\n${body}\n);`
}

function renderExpression(value: unknown, sourceTable: string): string {
	const query = dialect.sqlToQuery(value as Parameters<PgDialect["sqlToQuery"]>[0])
	if (query.params.length > 0) {
		throw new Error(`Parameterized schema expression is not supported on ${sourceTable}`)
	}
	return query.sql.replaceAll(`${q(sourceTable)}.`, "")
}

function extraConfig(table: DrizzleTable): ExtraConfigItem[] {
	const builder = table[drizzleSymbol(table, "ExtraConfigBuilder")] as
		| ((columns: unknown) => ExtraConfigItem[])
		| undefined
	if (!builder) return []
	const columns = table[drizzleSymbol(table, "ExtraConfigColumns")]
	return builder(columns)
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
	return extraConfig(table)
		.filter((item) => item.constructor?.name === "IndexBuilder" && item.config)
		.map((index) => {
			const config = index.config!
			const uniqueness = config.unique ? "UNIQUE " : ""
			const columnList = config.columns.map((column) => q(column.name)).join(", ")
			const predicate = config.where
				? ` WHERE ${renderExpression(config.where, tableName(table))}`
				: ""
			return `CREATE ${uniqueness}INDEX ${q(config.name)} ON ${q(tableName(table))} (${columnList})${predicate};`
		})
}

function uniqueConstraintSql(table: DrizzleTable): string[] {
	return extraConfig(table)
		.filter(
			(item) =>
				item.constructor?.name === "UniqueConstraintBuilder" &&
				item.name &&
				item.columns &&
				item.columns.length > 0
		)
		.map((constraint) => {
			const nulls = constraint.nullsNotDistinctConfig ? " NULLS NOT DISTINCT" : ""
			const columns = constraint.columns!.map((column) => q(column.name)).join(", ")
			return `ALTER TABLE ${q(tableName(table))} ADD CONSTRAINT ${q(constraint.name!)} UNIQUE${nulls} (${columns});`
		})
}

function checkSql(table: DrizzleTable): string[] {
	return extraConfig(table)
		.filter((item) => item.constructor?.name === "CheckBuilder" && item.name && item.value)
		.map(
			(item) =>
				`ALTER TABLE ${q(tableName(table))} ADD CONSTRAINT ${q(item.name!)} CHECK (${renderExpression(item.value, tableName(table))});`
		)
}

async function main() {
	assertRegistryCoversSchema()
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
		...tables.flatMap(uniqueConstraintSql),
		"",
		...tables.flatMap(indexSql),
		"",
		...tables.flatMap(checkSql),
		"",
		"-- Native PostgreSQL constraints, partial indexes and triggers.",
		integritySql.trim(),
		"",
		"COMMIT;",
		"",
	]

	await mkdir(path.dirname(OUT_FILE), { recursive: true })
	await writeFile(OUT_FILE, `${lines.join("\n\n").trimEnd()}\n`)
	console.log(`Generated ${OUT_FILE} from ${tables.length} tables.`)
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
