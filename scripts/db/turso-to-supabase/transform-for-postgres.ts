import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"

import "dotenv/config"

import * as schema from "../../../src/shared/infrastructure/db/schema/tables"

const IN_DIR = process.env.FASTT_TURSO_EXPORT_DIR ?? "tmp/turso-export"
const OUT_DIR = process.env.FASTT_POSTGRES_IMPORT_DIR ?? "tmp/postgres-import"

type DrizzleTable = Record<string | symbol, unknown>
type ColumnMeta = {
	name: string
	columnType: string
	notNull: boolean
	hasDefault: boolean
}

type TransformContext = {
	policyGroupCategoryById: Map<string, unknown>
	policyGroupIds: Set<string>
	policyIds: Set<string>
	policyAssignmentIds: Set<string>
	ratePlanTemplateById: Map<string, Record<string, unknown>>
	userIds: Set<string>
}

type ReferentialSetName = "policyAssignmentIds" | "policyGroupIds" | "policyIds" | "userIds"

const policyAuditNullableReferences = new Map<string, ReferentialSetName>([
	["actorUserId", "userIds"],
	["assignmentId", "policyAssignmentIds"],
	["policyGroupId", "policyGroupIds"],
	["policyId", "policyIds"],
])

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
		notNull: column.notNull,
		hasDefault: column.hasDefault,
	}))
}

function parseJson(value: unknown): unknown {
	if (value == null || value === "") return null
	if (typeof value !== "string") return value
	try {
		return JSON.parse(value)
	} catch {
		return value
	}
}

function normalizeBoolean(value: unknown): boolean | null {
	if (value == null || value === "") return null
	if (typeof value === "boolean") return value
	if (typeof value === "number") return value !== 0
	const normalized = String(value).trim().toLowerCase()
	if (["1", "true", "yes"].includes(normalized)) return true
	if (["0", "false", "no"].includes(normalized)) return false
	return Boolean(value)
}

function normalizeNumber(value: unknown): number | null {
	if (value == null || value === "") return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

function normalizeNumeric(value: unknown): string | null {
	const parsed = normalizeNumber(value)
	return parsed == null ? null : String(parsed)
}

function normalizeDate(value: unknown): string | null {
	if (value == null || value === "") return null
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
	const date = toDate(value)
	return date ? date.toISOString().slice(0, 10) : null
}

function normalizeTimestamp(value: unknown): string | null {
	if (value == null || value === "") return null
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return `${value}T00:00:00.000Z`
	}
	const date = toDate(value)
	return date ? date.toISOString() : null
}

function toDate(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
	if (typeof value === "number") {
		const millis = value > 10_000_000_000 ? value : value * 1000
		const date = new Date(millis)
		return Number.isNaN(date.getTime()) ? null : date
	}
	const asString = String(value).trim()
	if (/^\d+$/.test(asString)) return toDate(Number(asString))
	const date = new Date(asString)
	return Number.isNaN(date.getTime()) ? null : date
}

function transformValue(value: unknown, column: ColumnMeta): unknown {
	switch (column.columnType) {
		case "PgJsonb":
			return parseJson(value)
		case "PgBoolean":
			return normalizeBoolean(value)
		case "PgInteger":
			return normalizeNumber(value)
		case "PgNumeric":
			return normalizeNumeric(value)
		case "PgDate":
		case "PgDateString":
			return normalizeDate(value)
		case "PgTimestamp":
			return normalizeTimestamp(value)
		default:
			return value == null ? null : value
	}
}

function sourceValueFor(
	tableName: string,
	sourceRow: Record<string, unknown>,
	column: ColumnMeta,
	context: TransformContext
): unknown {
	if (Object.hasOwn(sourceRow, column.name)) return sourceRow[column.name]

	if (tableName === "RatePlan") {
		const templateId = String(sourceRow.templateId ?? "").trim()
		const template = templateId ? context.ratePlanTemplateById.get(templateId) : null
		if (column.name === "name") return template?.name ?? "Tarifa"
		if (column.name === "description") return template?.description ?? null
	}

	return defaultValueFor(column)
}

function postProcessValue(
	tableName: string,
	sourceRow: Record<string, unknown>,
	column: ColumnMeta,
	value: unknown,
	context: TransformContext
) {
	if (tableName === "PolicyAssignment" && column.name === "category" && value == null) {
		const policyGroupId = String(sourceRow.policyGroupId ?? "").trim()
		return context.policyGroupCategoryById.get(policyGroupId) ?? null
	}
	if (tableName === "PolicyAuditLog" && value != null) {
		const referenceSet = policyAuditNullableReferences.get(column.name)
		if (referenceSet && !context[referenceSet].has(String(value))) return null
	}
	return value
}

function defaultValueFor(column: ColumnMeta): unknown {
	if (!column.hasDefault) return null
	switch (column.columnType) {
		case "PgBoolean":
			return false
		case "PgInteger":
			return 0
		case "PgNumeric":
			return "0"
		case "PgJsonb":
			return {}
		case "PgDate":
		case "PgDateString":
			return new Date().toISOString().slice(0, 10)
		case "PgTimestamp":
			return new Date().toISOString()
		default:
			return ""
	}
}

async function transformTable(tableName: string, sourceFile: string, context: TransformContext) {
	const columns = columnsFor(tableName)
	const targetFile = path.join(OUT_DIR, `${tableName}.jsonl`)
	const read = readline.createInterface({
		input: createReadStream(sourceFile, { encoding: "utf8" }),
		crlfDelay: Number.POSITIVE_INFINITY,
	})
	const write = createWriteStream(targetFile, { encoding: "utf8" })
	let rows = 0
	let nullabilityWarnings = 0
	const seenDestinationSlugs = new Set<string>()

	for await (const line of read) {
		if (!line.trim()) continue
		const sourceRow = JSON.parse(line) as Record<string, unknown>
		const targetRow: Record<string, unknown> = {}

		for (const column of columns) {
			const sourceValue = sourceValueFor(tableName, sourceRow, column, context)
			const transformedValue = transformValue(sourceValue, column)
			const value = postProcessValue(tableName, sourceRow, column, transformedValue, context)
			if (value == null && column.notNull) nullabilityWarnings += 1
			targetRow[column.name] = value
		}
		if (tableName === "Destination") {
			const slug = String(targetRow.slug ?? "").trim()
			if (slug && seenDestinationSlugs.has(slug)) {
				targetRow.slug = `${slug}-${String(targetRow.id ?? rows + 1)
					.trim()
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "")}`
			}
			if (targetRow.slug) seenDestinationSlugs.add(String(targetRow.slug))
		}

		write.write(`${JSON.stringify(targetRow)}\n`)
		rows += 1
	}

	await new Promise<void>((resolve, reject) => {
		write.end(resolve)
		write.on("error", reject)
	})

	return { tableName, rows, nullabilityWarnings, file: targetFile }
}

async function readJsonl(file: string): Promise<Record<string, unknown>[]> {
	const rows: Record<string, unknown>[] = []
	const read = readline.createInterface({
		input: createReadStream(file, { encoding: "utf8" }),
		crlfDelay: Number.POSITIVE_INFINITY,
	})
	for await (const line of read) {
		if (line.trim()) rows.push(JSON.parse(line) as Record<string, unknown>)
	}
	return rows
}

async function createTransformContext(manifest: {
	tables: { tableName: string; file: string }[]
	auxiliaryTables?: { tableName: string; file: string }[]
}): Promise<TransformContext> {
	const policyGroups = await readJsonl(
		manifest.tables.find((table) => table.tableName === "PolicyGroup")?.file ??
			path.join(IN_DIR, "PolicyGroup.jsonl")
	)
	const ratePlanTemplates = await readJsonl(
		manifest.auxiliaryTables?.find((table) => table.tableName === "RatePlanTemplate")?.file ??
			path.join(IN_DIR, "RatePlanTemplate.jsonl")
	)
	const policies = await readJsonl(
		manifest.tables.find((table) => table.tableName === "Policy")?.file ??
			path.join(IN_DIR, "Policy.jsonl")
	)
	const policyAssignments = await readJsonl(
		manifest.tables.find((table) => table.tableName === "PolicyAssignment")?.file ??
			path.join(IN_DIR, "PolicyAssignment.jsonl")
	)
	const users = await readJsonl(
		manifest.tables.find((table) => table.tableName === "User")?.file ??
			path.join(IN_DIR, "User.jsonl")
	)
	return {
		policyGroupCategoryById: new Map(
			policyGroups.map((row) => [String(row.id ?? ""), row.category])
		),
		policyGroupIds: new Set(policyGroups.map((row) => String(row.id ?? "")).filter(Boolean)),
		policyIds: new Set(policies.map((row) => String(row.id ?? "")).filter(Boolean)),
		policyAssignmentIds: new Set(
			policyAssignments.map((row) => String(row.id ?? "")).filter(Boolean)
		),
		ratePlanTemplateById: new Map(ratePlanTemplates.map((row) => [String(row.id ?? ""), row])),
		userIds: new Set(users.map((row) => String(row.id ?? "")).filter(Boolean)),
	}
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true })
	const manifest = JSON.parse(await readFile(path.join(IN_DIR, "manifest.json"), "utf8")) as {
		tables: { tableName: string; file: string }[]
		auxiliaryTables?: { tableName: string; file: string }[]
	}
	const context = await createTransformContext(manifest)
	const tables = []

	for (const table of manifest.tables) {
		const entry = await transformTable(table.tableName, table.file, context)
		tables.push(entry)
		console.log(
			`${table.tableName}: transformed ${entry.rows} rows, nullability warnings ${entry.nullabilityWarnings}`
		)
	}

	await writeFile(
		path.join(OUT_DIR, "manifest.json"),
		JSON.stringify(
			{
				createdAt: new Date().toISOString(),
				sourceManifest: path.join(IN_DIR, "manifest.json"),
				tables,
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
