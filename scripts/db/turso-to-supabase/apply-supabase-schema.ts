import { readFile } from "node:fs/promises"

import "dotenv/config"
import postgres from "postgres"

const SCHEMA_FILE = process.env.FASTT_POSTGRES_SCHEMA_FILE ?? "db/postgres/0001_initial_schema.sql"

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`Missing required env ${name}`)
	return value
}

function splitSqlStatements(source: string): string[] {
	const statements: string[] = []
	let current = ""
	let quote: "'" | '"' | "$$" | null = null
	let index = 0

	while (index < source.length) {
		const char = source[index]
		const next = source[index + 1]

		if (!quote && char === "-" && next === "-") {
			const lineEnd = source.indexOf("\n", index)
			if (lineEnd === -1) break
			current += source.slice(index, lineEnd + 1)
			index = lineEnd + 1
			continue
		}

		if (!quote && char === "$" && next === "$") {
			quote = "$$"
			current += "$$"
			index += 2
			continue
		}
		if (quote === "$$" && char === "$" && next === "$") {
			quote = null
			current += "$$"
			index += 2
			continue
		}

		if (!quote && (char === "'" || char === '"')) {
			quote = char
			current += char
			index += 1
			continue
		}
		if (quote === char) {
			quote = null
			current += char
			index += 1
			continue
		}

		if (!quote && char === ";") {
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

async function main() {
	const sql = postgres(requireEnv("DIRECT_URL"), { max: 1, prepare: false })
	const source = await readFile(SCHEMA_FILE, "utf8")
	const statements = splitSqlStatements(source)

	try {
		for (const [index, statement] of statements.entries()) {
			await sql.unsafe(statement)
			console.log(`schema: applied ${index + 1}/${statements.length}`)
		}
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
