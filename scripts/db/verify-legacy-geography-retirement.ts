import "dotenv/config"

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import postgres from "postgres"

import { ensureCleanPostgresEnv } from "../../src/shared/infrastructure/db/clean-db-env"

ensureCleanPostgresEnv()

const SOURCE_ROOT = path.resolve("src")
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".astro"])
const LEGACY_RUNTIME_PATTERNS = [
	{ name: "Destination table", expression: /\bDestination\b/ },
	{ name: "Product.destinationId", expression: /Product\.destinationId/ },
	{ name: "Legacy destination mapping", expression: /LegacyDestinationGeoPlaceMap/ },
] as const

type SourceFinding = {
	file: string
	line: number
	pattern: string
}

function hasFlag(name: string) {
	return process.argv.includes(name)
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`Missing required env ${name}`)
	return value
}

async function filesIn(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const children = await Promise.all(
		entries.map(async (entry) => {
			const resolved = path.join(directory, entry.name)
			if (entry.isDirectory()) return filesIn(resolved)
			return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [resolved] : []
		})
	)
	return children.flat()
}

async function findRuntimeConsumers(): Promise<SourceFinding[]> {
	const files = await filesIn(SOURCE_ROOT)
	const findings: SourceFinding[] = []

	for (const file of files) {
		const source = await readFile(file, "utf8")
		const lines = source.split("\n")
		for (const pattern of LEGACY_RUNTIME_PATTERNS) {
			lines.forEach((line, index) => {
				if (pattern.expression.test(line)) {
					findings.push({
						file: path.relative(process.cwd(), file),
						line: index + 1,
						pattern: pattern.name,
					})
				}
			})
		}
	}

	return findings.sort(
		(left, right) => left.file.localeCompare(right.file) || left.line - right.line
	)
}

async function databaseDependencies() {
	const sql = postgres(requireEnv("DIRECT_URL"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})

	try {
		const [counts] = await sql`
			select
				(select count(*) from "Product" where "destinationId" is not null)::int as products_with_legacy_destination,
				(select count(*) from "MarketplaceEvent" where "destinationId" is not null)::int as events_with_legacy_destination,
				(select count(*) from "LegacyDestinationGeoPlaceMap")::int as destination_equivalences,
				(select count(*) from "ProductGeoPlaceBackfill")::int as backfill_evidence
		`
		return counts
	} finally {
		await sql.end()
	}
}

async function main() {
	const sourceFindings = await findRuntimeConsumers()
	const report: Record<string, unknown> = {
		phase: "marketplace-geography-retirement",
		ready: sourceFindings.length === 0,
		sourceFindings,
	}

	if (hasFlag("--database")) {
		const dependencies = await databaseDependencies()
		report.databaseDependencies = dependencies
		report.ready =
			report.ready === true && Object.values(dependencies).every((value) => Number(value) === 0)
	}

	console.log(JSON.stringify(report, null, 2))
	if (report.ready !== true) {
		throw new Error(
			"Legacy geography retirement is not safe: remove runtime consumers and resolve every database dependency before applying a destructive migration."
		)
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
