import "dotenv/config"

import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import postgres from "postgres"

import { ensureCleanPostgresEnv } from "../../src/shared/infrastructure/db/clean-db-env"

ensureCleanPostgresEnv()

const EXTENSIONS = new Set([".ts", ".tsx", ".astro"])
const LEGACY = /\bDestination\b|\bdestinationId\b|\bLegacyDestinationGeoPlaceMap\b|\bProductGeoPlaceBackfill\b/
const LEGACY_WRITER = /insert\(\s*Destination|insert\s+into\s+"Destination"|\.destinationId\s*[,:=]|\bdestinationId\s*:/

type Finding = { file: string; line: number }

async function filesIn(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true })
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const file = path.join(root, entry.name)
			if (entry.isDirectory()) return filesIn(file)
			return EXTENSIONS.has(path.extname(entry.name)) ? [file] : []
		})
	)
	return nested.flat()
}

async function scan(root: string, excludes: string[] = [], expression = LEGACY): Promise<Finding[]> {
	const files = await filesIn(path.resolve(root))
	const findings: Finding[] = []
	for (const file of files) {
		const relative = path.relative(process.cwd(), file)
		if (excludes.some((excluded) => relative.startsWith(excluded))) continue
		const lines = (await readFile(file, "utf8")).split("\n")
		lines.forEach((line, index) => {
			if (expression.test(line)) findings.push({ file: relative, line: index + 1 })
		})
	}
	return findings
}

async function evidenceIsIntact() {
	try {
		const report = JSON.parse(
			await readFile(path.resolve("db/reports/legacy-geography-retirement-evidence.json"), "utf8")
		) as Record<string, unknown>
		const { sha256, ...payload } = report
		return typeof sha256 === "string" && sha256 === createHash("sha256").update(JSON.stringify(payload)).digest("hex")
	} catch {
		return false
	}
}

async function databaseState(final: boolean) {
	const directUrl = process.env.DIRECT_URL?.trim()
	if (!directUrl) throw new Error("Missing required env DIRECT_URL")
	const sql = postgres(directUrl, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15 })
	try {
		const [state] = await sql`
			select
				(select count(*) from "Product" p where not exists (
					select 1 from "ProductGeoPlace" pgp
					where pgp."productId" = p."id" and pgp."role" = 'primary_discovery' and pgp."isPrimary" = true
				))::int as products_without_primary_place,
				(select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'Destination')::int as destination_table,
				(select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'LegacyDestinationGeoPlaceMap')::int as legacy_map_table,
				(select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'ProductGeoPlaceBackfill')::int as backfill_table,
				(select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'destinationId')::int as destination_id_columns
		`
		const legacyColumns = await sql<{ table_name: string }[]>`
			select table_name
			from information_schema.columns
			where table_schema = 'public'
				and column_name = 'destinationId'
				and table_name in ('Product', 'MarketplaceEvent')
		`
		const legacyColumnTables = new Set(legacyColumns.map((column) => column.table_name))

		if (!final) {
			// The verifier also runs after the destructive migration. Query each legacy
			// column only while it exists so an audit can never fail merely because the
			// retirement it is checking has already completed.
			const productsWithDestination = legacyColumnTables.has("Product")
				? Number((await sql`select count(*)::int as count from "Product" where "destinationId" is not null`)[0]?.count ?? 0)
				: 0
			const eventsWithDestination = legacyColumnTables.has("MarketplaceEvent")
				? Number((await sql`select count(*)::int as count from "MarketplaceEvent" where "destinationId" is not null`)[0]?.count ?? 0)
				: 0

			return {
				...state,
				products_with_destination: productsWithDestination,
				events_with_destination: eventsWithDestination,
			}
		}
		return state
	} finally {
		await sql.end()
	}
}

async function main() {
	const final = process.argv.includes("--final")
	const runtime = await scan("src", final ? [] : ["src/shared/infrastructure/db/schema/"])
	const fixtureWriters = await scan("tests", [], LEGACY_WRITER)
	const scriptWriters = await scan("src/scripts", [], LEGACY_WRITER)
	const database = await databaseState(final)
	const evidence = await evidenceIsIntact()
	const ready =
		runtime.length === 0 &&
		fixtureWriters.length === 0 &&
		scriptWriters.length === 0 &&
		evidence &&
		Number(database.products_without_primary_place) === 0 &&
		(final
			? ["destination_table", "legacy_map_table", "backfill_table", "destination_id_columns"].every(
					(key) => Number(database[key as keyof typeof database]) === 0
				)
			: Number(database.products_with_destination) === 0 && Number(database.events_with_destination) === 0)

	console.log(JSON.stringify({ phase: final ? "final" : "preflight", ready, evidence, runtime, fixtureWriters, scriptWriters, database }, null, 2))
	if (!ready) throw new Error("Legacy geography retirement gate failed.")
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
