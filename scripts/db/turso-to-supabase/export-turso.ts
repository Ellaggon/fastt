import { createWriteStream } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { createClient } from "@libsql/client"
import "dotenv/config"

import * as schema from "../../../src/shared/infrastructure/db/schema/tables"
import { databaseTableNames } from "../../../src/shared/infrastructure/db/schema/registry"

const OUT_DIR = process.env.FASTT_TURSO_EXPORT_DIR ?? "tmp/turso-export"
const BATCH_SIZE = Number(process.env.FASTT_TURSO_EXPORT_BATCH_SIZE ?? 500)

type DrizzleTable = Record<string | symbol, unknown>

function optionalEnv(...names: string[]): string {
	for (const name of names) {
		const value = process.env[name]?.trim()
		if (value) return value
	}
	throw new Error(`Missing required env: one of ${names.join(", ")}`)
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

function q(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`
}

async function exportTable(
	client: ReturnType<typeof createClient>,
	tableName: string,
	targetColumns: string[]
) {
	const sourceColumnRows = await client.execute(`PRAGMA table_info(${q(tableName)})`)
	const sourceColumns = sourceColumnRows.rows.map((row) => String(row.name))
	const sourceColumnSet = new Set(sourceColumns)
	const columns = sourceColumns
	const missingColumns = targetColumns.filter((column) => !sourceColumnSet.has(column))
	const file = path.join(OUT_DIR, `${tableName}.jsonl`)
	const stream = createWriteStream(file, { encoding: "utf8" })
	let offset = 0
	let count = 0

	if (columns.length > 0) {
		while (true) {
			const result = await client.execute({
				sql: `SELECT ${columns.map(q).join(", ")} FROM ${q(tableName)} ORDER BY ${q(
					sourceColumnSet.has(targetColumns[0]) ? targetColumns[0] : columns[0]
				)} LIMIT ? OFFSET ?`,
				args: [BATCH_SIZE, offset],
			})
			if (result.rows.length === 0) break

			for (const row of result.rows) {
				stream.write(`${JSON.stringify(row)}\n`)
				count += 1
			}

			offset += result.rows.length
			if (result.rows.length < BATCH_SIZE) break
		}
	}

	await new Promise<void>((resolve, reject) => {
		stream.end(resolve)
		stream.on("error", reject)
	})

	return {
		tableName,
		rows: count,
		file,
		columns,
		missingColumns,
		tableExistsInSource: sourceColumnSet.size > 0,
	}
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true })
	const client = createClient({
		url: optionalEnv("TURSO_DATABASE_URL", "ASTRO_DB_REMOTE_URL"),
		authToken: optionalEnv("TURSO_AUTH_TOKEN", "ASTRO_DB_APP_TOKEN"),
	})

	const manifest = []
	for (const tableName of databaseTableNames) {
		const columns = columnsFor(tableName)
		const entry = await exportTable(client, tableName, columns)
		manifest.push(entry)
		console.log(
			`${tableName}: exported ${entry.rows} rows${
				entry.missingColumns.length ? `, missing ${entry.missingColumns.length} columns` : ""
			}${entry.tableExistsInSource ? "" : ", source table missing"}`
		)
	}
	const auxiliaryTables = []
	for (const tableName of ["RatePlanTemplate"]) {
		const entry = await exportTable(client, tableName, [])
		auxiliaryTables.push(entry)
		console.log(
			`${tableName}: exported ${entry.rows} auxiliary rows${
				entry.tableExistsInSource ? "" : ", source table missing"
			}`
		)
	}

	client.close()
	await writeFile(
		path.join(OUT_DIR, "manifest.json"),
		JSON.stringify(
			{
				createdAt: new Date().toISOString(),
				source: "turso",
				tables: manifest,
				auxiliaryTables,
			},
			null,
			2
		)
	)
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
