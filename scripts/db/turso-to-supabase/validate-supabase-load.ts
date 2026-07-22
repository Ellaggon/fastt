import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"

import "dotenv/config"
import postgres from "postgres"

import * as schema from "../../../src/shared/infrastructure/db/schema/tables"
import {
	databaseTableNames,
	databaseTablesByDomain,
} from "../../../src/shared/infrastructure/db/schema/registry"

const IMPORT_DIR = process.env.FASTT_POSTGRES_IMPORT_DIR ?? "tmp/postgres-import"
const REPORT_FILE =
	process.env.FASTT_SUPABASE_VALIDATION_REPORT ?? path.join(IMPORT_DIR, "validation-report.json")

type DrizzleTable = Record<string | symbol, unknown>
type ColumnMeta = {
	name: string
	columnType: string
	scale?: number
}
type TableValidation = {
	tableName: string
	expectedRows: number
	actualRows: number
	countMatches: boolean
	expectedChecksum: string
	actualChecksum: string
	checksumMatches: boolean
}

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

function columnsFor(tableName: string): ColumnMeta[] {
	const table = (schema as unknown as Record<string, DrizzleTable>)[tableName]
	if (!table) throw new Error(`Missing schema export ${tableName}`)
	const columns = table[drizzleSymbol(table, "Columns")] as Record<string, ColumnMeta>
	return Object.values(columns).map((column) => ({
		name: column.name,
		columnType: column.columnType,
		scale: column.scale,
	}))
}

function q(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
			.join(",")}}`
	}
	return JSON.stringify(value)
}

function normalizeTimestamp(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString()
	if (typeof value === "string" && value) return new Date(value).toISOString()
	return value
}

function normalizeDate(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	if (typeof value === "string" && value) return value.slice(0, 10)
	return value
}

function normalizeNumeric(value: unknown, scale?: number): unknown {
	if (value == null) return value
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return value
	return typeof scale === "number" ? parsed.toFixed(scale) : String(parsed)
}

function normalizeReal(value: unknown): unknown {
	if (value == null) return value
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return value
	return Number(Math.fround(parsed).toPrecision(6))
}

function normalizeValue(value: unknown, column: ColumnMeta): unknown {
	switch (column.columnType) {
		case "PgDate":
		case "PgDateString":
			return normalizeDate(value)
		case "PgNumeric":
			return normalizeNumeric(value, column.scale)
		case "PgReal":
			return normalizeReal(value)
		case "PgTimestamp":
			return normalizeTimestamp(value)
		default:
			return value
	}
}

function normalizeRow(
	row: Record<string, unknown>,
	columns: ColumnMeta[]
): Record<string, unknown> {
	return Object.fromEntries(
		columns.map((column) => [column.name, normalizeValue(row[column.name], column)])
	)
}

async function checksumJsonl(
	file: string,
	columns: ColumnMeta[]
): Promise<{ rows: number; checksum: string }> {
	const hash = createHash("sha256")
	const read = readline.createInterface({
		input: createReadStream(file, { encoding: "utf8" }),
		crlfDelay: Number.POSITIVE_INFINITY,
	})
	let rows = 0

	for await (const line of read) {
		if (!line.trim()) continue
		hash.update(`${stableJson(normalizeRow(JSON.parse(line), columns))}\n`)
		rows += 1
	}

	return { rows, checksum: hash.digest("hex") }
}

async function checksumPostgres(
	sql: postgres.Sql,
	tableName: string,
	columns: ColumnMeta[]
): Promise<{ rows: number; checksum: string }> {
	const hash = createHash("sha256")
	const rows = await sql.unsafe<Record<string, unknown>[]>(
		`SELECT ${columns.map((column) => q(column.name)).join(", ")} FROM ${q(tableName)} ORDER BY ${q(columns[0].name)}`
	)

	for (const row of rows) {
		hash.update(`${stableJson(normalizeRow(row, columns))}\n`)
	}

	return { rows: rows.length, checksum: hash.digest("hex") }
}

async function validateFunctionalReads(sql: postgres.Sql) {
	const criticalTables = [
		"Provider",
		"Product",
		"Variant",
		"RatePlan",
		"SearchUnitView",
		"DailyInventory",
		"EffectivePricingV2",
		"Booking",
		"Policy",
		"PaymentTransaction",
	]
	const tableCounts = Object.fromEntries(
		await Promise.all(
			criticalTables.map(async (tableName) => {
				const rows = await sql.unsafe<{ count: string }[]>(
					`SELECT count(*)::text AS count FROM ${q(tableName)}`
				)
				return [tableName, Number(rows[0]?.count ?? 0)]
			})
		)
	)

	const providerCatalogRows = await sql.unsafe<{ count: string }[]>(`
		SELECT count(*)::text AS count
		FROM "Provider" p
		JOIN "Product" pr ON pr."providerId" = p."id"
		LEFT JOIN "Variant" v ON v."productId" = pr."id"
	`)
	const pricingRows = await sql.unsafe<{ count: string }[]>(`
		SELECT count(*)::text AS count
		FROM "RatePlan" rp
		LEFT JOIN "EffectivePricingV2" ep ON ep."ratePlanId" = rp."id"
	`)
	const bookingRows = await sql.unsafe<{ count: string }[]>(`
		SELECT count(*)::text AS count
		FROM "Booking" b
		LEFT JOIN "BookingRoomDetail" brd ON brd."bookingId" = b."id"
		LEFT JOIN "PaymentTransaction" pt ON pt."bookingId" = b."id"
	`)

	return {
		tableCounts,
		joinReads: {
			providerCatalog: Number(providerCatalogRows[0]?.count ?? 0),
			ratePlanPricing: Number(pricingRows[0]?.count ?? 0),
			bookingFinancial: Number(bookingRows[0]?.count ?? 0),
		},
	}
}

async function main() {
	const sql = postgres(requireEnv("DIRECT_URL"), { max: 1, prepare: false })
	const manifest = JSON.parse(await readFile(path.join(IMPORT_DIR, "manifest.json"), "utf8")) as {
		tables: { tableName: string; file: string; rows: number }[]
	}
	const validations: TableValidation[] = []

	try {
		for (const tableName of databaseTableNames) {
			const tableManifest = manifest.tables.find((table) => table.tableName === tableName)
			if (!tableManifest) throw new Error(`Missing transformed manifest entry for ${tableName}`)
			const columns = columnsFor(tableName)
			const expected = await checksumJsonl(tableManifest.file, columns)
			const actual = await checksumPostgres(sql, tableName, columns)
			const entry = {
				tableName,
				expectedRows: expected.rows,
				actualRows: actual.rows,
				countMatches: expected.rows === actual.rows,
				expectedChecksum: expected.checksum,
				actualChecksum: actual.checksum,
				checksumMatches: expected.checksum === actual.checksum,
			}
			validations.push(entry)
			console.log(
				`${tableName}: count ${entry.countMatches ? "ok" : "mismatch"}, checksum ${entry.checksumMatches ? "ok" : "mismatch"}`
			)
		}

		const functionalReads = await validateFunctionalReads(sql)
		const report = {
			createdAt: new Date().toISOString(),
			domains: databaseTablesByDomain,
			tables: validations,
			functionalReads,
			ok: validations.every((entry) => entry.countMatches && entry.checksumMatches),
		}
		await writeFile(REPORT_FILE, JSON.stringify(report, null, 2))
		if (!report.ok) process.exitCode = 1
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
