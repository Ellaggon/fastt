import { createReadStream } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"

import "dotenv/config"
import postgres from "postgres"

import * as schema from "../../../src/shared/infrastructure/db/schema/tables"
import { databaseTableNames } from "../../../src/shared/infrastructure/db/schema/registry"

const IN_DIR = process.env.FASTT_POSTGRES_IMPORT_DIR ?? "tmp/postgres-import"
const BATCH_SIZE = Number(process.env.FASTT_SUPABASE_LOAD_BATCH_SIZE ?? 250)
const SHOULD_TRUNCATE = process.env.FASTT_SUPABASE_TRUNCATE === "1"

type DrizzleTable = Record<string | symbol, unknown>

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`Missing required env ${name}`)
	return value
}

function drizzleSymbol(target: object, marker: string): symbol {
	const symbol = Object.getOwnPropertySymbols(target).find((candidate) =>
		String(candidate).includes(marker)
	)
	if (!symbol) throw new Error(`Missing Drizzle symbol ${marker}`)
	return symbol
}

function columnsFor(tableName: string): string[] {
	const table = (schema as unknown as Record<string, DrizzleTable>)[tableName]
	if (!table) throw new Error(`Missing schema export ${tableName}`)
	const columns = table[drizzleSymbol(table, "Columns")] as Record<string, { name: string }>
	return Object.values(columns).map((column) => column.name)
}

function tableNameFor(table: unknown): string {
	const symbol = drizzleSymbol(table as object, "Name")
	return String((table as Record<symbol, unknown>)[symbol])
}

function foreignDependenciesFor(tableName: string): string[] {
	const table = (schema as unknown as Record<string, DrizzleTable>)[tableName]
	if (!table) throw new Error(`Missing schema export ${tableName}`)
	const symbol = drizzleSymbol(table, "PgInlineForeignKeys")
	const fks = table[symbol] as Array<{ reference: () => { foreignTable: unknown } }>
	return [
		...new Set(
			fks
				.map((fk) => tableNameFor(fk.reference().foreignTable))
				.filter((dependency) => dependency !== tableName && databaseTableNames.includes(dependency))
		),
	]
}

function loadOrder(): string[] {
	const remaining = new Set(databaseTableNames)
	const dependenciesByTable = new Map(
		databaseTableNames.map((tableName) => [
			tableName,
			new Set(foreignDependenciesFor(tableName).filter((dependency) => remaining.has(dependency))),
		])
	)
	const ordered: string[] = []

	while (remaining.size > 0) {
		const ready = [...remaining].filter((tableName) => {
			const dependencies = dependenciesByTable.get(tableName)
			return !dependencies || [...dependencies].every((dependency) => !remaining.has(dependency))
		})
		if (ready.length === 0) {
			throw new Error(
				`Unable to resolve table load order. Remaining tables: ${[...remaining].join(", ")}`
			)
		}
		for (const tableName of ready) {
			remaining.delete(tableName)
			ordered.push(tableName)
		}
	}

	return ordered
}

function q(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`
}

function insertSql(tableName: string, columns: string[], batchSize: number): string {
	const columnSql = columns.map(q).join(", ")
	const rows = Array.from({ length: batchSize }, (_, rowIndex) => {
		const placeholders = columns.map(
			(_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`
		)
		return `(${placeholders.join(", ")})`
	}).join(", ")
	return `INSERT INTO ${q(tableName)} (${columnSql}) VALUES ${rows}`
}

async function flush(
	sql: postgres.Sql,
	tableName: string,
	columns: string[],
	rows: Record<string, unknown>[]
) {
	if (rows.length === 0) return
	const values = rows.flatMap((row) => columns.map((column) => row[column] ?? null)) as never[]
	await sql.unsafe(insertSql(tableName, columns, rows.length), values)
}

async function truncateAll(sql: postgres.Sql) {
	for (const tableName of [...loadOrder()].reverse()) {
		await sql.unsafe(`TRUNCATE TABLE ${q(tableName)} RESTART IDENTITY CASCADE`)
		console.log(`${tableName}: truncated`)
	}
}

async function loadTable(sql: postgres.Sql, tableName: string, sourceFile: string) {
	const columns = columnsFor(tableName)
	const read = readline.createInterface({
		input: createReadStream(sourceFile, { encoding: "utf8" }),
		crlfDelay: Number.POSITIVE_INFINITY,
	})
	let batch: Record<string, unknown>[] = []
	let rows = 0

	for await (const line of read) {
		if (!line.trim()) continue
		batch.push(JSON.parse(line) as Record<string, unknown>)
		if (batch.length >= BATCH_SIZE) {
			await flush(sql, tableName, columns, batch)
			rows += batch.length
			batch = []
		}
	}

	await flush(sql, tableName, columns, batch)
	rows += batch.length
	return { tableName, rows }
}

async function main() {
	const sql = postgres(requireEnv("DIRECT_URL"), { max: 1, prepare: false })
	const manifest = JSON.parse(await readFile(path.join(IN_DIR, "manifest.json"), "utf8")) as {
		tables: { tableName: string; file: string }[]
	}
	const result = []

	try {
		if (SHOULD_TRUNCATE) await truncateAll(sql)

		for (const tableName of loadOrder()) {
			const tableManifest = manifest.tables.find((table) => table.tableName === tableName)
			if (!tableManifest) throw new Error(`Missing transformed file for ${tableName}`)
			const entry = await loadTable(sql, tableName, tableManifest.file)
			result.push(entry)
			console.log(`${tableName}: loaded ${entry.rows} rows`)
		}
	} finally {
		await sql.end()
	}

	await writeFile(
		path.join(IN_DIR, "load-result.json"),
		JSON.stringify({ createdAt: new Date().toISOString(), tables: result }, null, 2)
	)
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
