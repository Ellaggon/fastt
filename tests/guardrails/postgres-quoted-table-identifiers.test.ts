import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

import { databaseTableNames } from "@/shared/infrastructure/db/schema/registry"

const extensions = new Set([".ts", ".tsx", ".astro", ".js", ".mjs"])
const escapedTables = databaseTableNames
	.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
	.join("|")
const unquotedTableReference = new RegExp(
	`\\b(?:FROM|JOIN|INTO|UPDATE|DELETE\\s+FROM)\\s+(${escapedTables})\\b`,
	"g"
)

function sourceFiles(root: string): string[] {
	const cwd = process.cwd()
	const output: string[] = []
	function visit(directory: string) {
		for (const entry of readdirSync(directory)) {
			const absolute = join(directory, entry)
			const stats = statSync(absolute)
			if (stats.isDirectory()) visit(absolute)
			else if (stats.isFile() && extensions.has(absolute.slice(absolute.lastIndexOf(".")))) {
				output.push(relative(cwd, absolute))
			}
		}
	}
	visit(join(cwd, root))
	return output.sort()
}

describe("Guardrail: PostgreSQL table identifiers", () => {
	it("requires quoted registered table names in raw SQL", () => {
		const violations: string[] = []
		for (const file of [...sourceFiles("src"), ...sourceFiles("scripts")]) {
			const source = readFileSync(file, "utf8")
			for (const match of source.matchAll(unquotedTableReference)) {
				const line = source.slice(0, match.index).split("\n").length
				violations.push(`${file}:${line} -> ${match[0]}`)
			}
		}
		expect(violations, `Unquoted PostgreSQL table references:\n${violations.join("\n")}`).toEqual([])
	})
})
