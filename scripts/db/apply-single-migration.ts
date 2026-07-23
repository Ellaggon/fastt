import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import "dotenv/config"
import postgres from "postgres"

const MIGRATIONS_DIR = path.resolve("db/migrations")
const LOCK_KEY = 8_370_202_607_22

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`Missing required env ${name}`)
	return value
}

function argValue(name: string): string | null {
	const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
	if (inline) return inline.slice(name.length + 1)
	const index = process.argv.indexOf(name)
	if (index >= 0) return process.argv[index + 1] ?? null
	return null
}

function hasFlag(name: string): boolean {
	return process.argv.includes(name)
}

function resolveMigrationFile(): string {
	const raw = argValue("--file") ?? process.env.FASTT_MIGRATION_FILE
	if (!raw?.trim()) {
		throw new Error(
			"Missing migration file. Use --file db/migrations/name.sql or FASTT_MIGRATION_FILE."
		)
	}

	const resolved = path.resolve(raw)
	const relative = path.relative(MIGRATIONS_DIR, resolved)
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Migration file must be inside db/migrations: ${raw}`)
	}
	if (!resolved.endsWith(".sql")) {
		throw new Error(`Migration file must be a .sql file: ${raw}`)
	}
	return resolved
}

function checksum(source: string): string {
	return createHash("sha256").update(source).digest("hex")
}

function splitSqlStatements(source: string): string[] {
	const statements: string[] = []
	let current = ""
	let quote: "'" | '"' | null = null
	let dollarTag: string | null = null
	let blockComment = false
	let index = 0

	while (index < source.length) {
		const char = source[index]
		const next = source[index + 1]

		if (blockComment) {
			current += char
			if (char === "*" && next === "/") {
				current += next
				index += 2
				blockComment = false
				continue
			}
			index += 1
			continue
		}

		if (!quote && !dollarTag && char === "/" && next === "*") {
			current += char + next
			index += 2
			blockComment = true
			continue
		}

		if (!quote && !dollarTag && char === "-" && next === "-") {
			const lineEnd = source.indexOf("\n", index)
			if (lineEnd === -1) {
				current += source.slice(index)
				break
			}
			current += source.slice(index, lineEnd + 1)
			index = lineEnd + 1
			continue
		}

		if (!quote && char === "$") {
			const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
			if (match) {
				const tag = match[0]
				current += tag
				index += tag.length
				if (dollarTag === tag) dollarTag = null
				else if (!dollarTag) dollarTag = tag
				continue
			}
		}

		if (!dollarTag && !quote && (char === "'" || char === '"')) {
			quote = char
			current += char
			index += 1
			continue
		}

		if (!dollarTag && quote === char) {
			current += char
			if (char === "'" && next === "'") {
				current += next
				index += 2
				continue
			}
			quote = null
			index += 1
			continue
		}

		if (!quote && !dollarTag && char === ";") {
			const statement = current.trim()
			if (statement) statements.push(statement)
			current = ""
			index += 1
			continue
		}

		current += char
		index += 1
	}

	const tail = current.trim()
	if (tail) statements.push(tail)
	return statements
}

async function ensureMigrationTable(sql: postgres.Sql) {
	await sql`
		create table if not exists "fastt_schema_migrations" (
			"id" text primary key,
			"filename" text not null,
			"checksum" text not null,
			"statementCount" integer not null,
			"appliedAt" timestamptz not null default now()
		)
	`
}

async function main() {
	const file = resolveMigrationFile()
	const dryRun = hasFlag("--dry-run") || process.env.FASTT_MIGRATION_DRY_RUN === "1"
	const source = await readFile(file, "utf8")
	const statements = splitSqlStatements(source)
	const id = path.basename(file, ".sql")
	const filename = path.relative(process.cwd(), file)
	const hash = checksum(source)

	if (statements.length === 0) throw new Error(`Migration has no SQL statements: ${filename}`)

	console.log(
		JSON.stringify({
			action: dryRun ? "dry-run" : "apply",
			id,
			filename,
			checksum: hash,
			statementCount: statements.length,
		})
	)

	if (dryRun) return

	const sql = postgres(requireEnv("DIRECT_URL"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})

	try {
		await ensureMigrationTable(sql)
		await sql.begin(async (tx) => {
			await tx`select pg_advisory_xact_lock(${LOCK_KEY})`
			const existing = await tx<{ checksum: string }[]>`
				select "checksum"
				from "fastt_schema_migrations"
				where "id" = ${id}
				limit 1
			`
			if (existing[0]?.checksum === hash) {
				console.log(JSON.stringify({ action: "skip", id, reason: "already_applied" }))
				return
			}
			if (existing[0]?.checksum && existing[0].checksum !== hash) {
				throw new Error(`Migration ${id} was already applied with a different checksum.`)
			}

			for (const [index, statement] of statements.entries()) {
				await tx.unsafe(statement)
				console.log(
					JSON.stringify({ action: "statement", id, current: index + 1, total: statements.length })
				)
			}

			await tx`
				insert into "fastt_schema_migrations" ("id", "filename", "checksum", "statementCount")
				values (${id}, ${filename}, ${hash}, ${statements.length})
			`
			console.log(JSON.stringify({ action: "applied", id, statementCount: statements.length }))
		})
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
