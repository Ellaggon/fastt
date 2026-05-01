import { describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SEARCH_RUNTIME_GLOBS = [
	"src/modules/search/application/**/*.ts",
	"src/modules/search/domain/**/*.ts",
	"src/modules/search/infrastructure/**/*.ts",
]

const EXCLUDE_GLOBS = [
	"src/modules/search/application/use-cases/materialize-search-unit.ts",
	"src/modules/search/application/use-cases/*materialize*.ts",
]

const BANNED = [
	{ name: "enqueueAutoBackfill", pattern: /\benqueueAutoBackfill\s*\(/g },
	{ name: "ensurePricingCoverage", pattern: /\bensurePricingCoverage[A-Za-z0-9_]*\s*\(/g },
	{ name: "materializeSearchUnit", pattern: /\bmaterializeSearchUnit(?:Range)?\s*\(/g },
	{ name: "db.insert", pattern: /\bdb\s*\.\s*insert\s*\(/g },
	{ name: "db.update", pattern: /\bdb\s*\.\s*update\s*\(/g },
	{ name: "db.delete", pattern: /\bdb\s*\.\s*delete\s*\(/g },
]

function listSearchRuntimeFiles(): string[] {
	const cmd = [
		"rg",
		"--files",
		...SEARCH_RUNTIME_GLOBS.flatMap((glob) => ["-g", glob]),
		...EXCLUDE_GLOBS.flatMap((glob) => ["-g", `!${glob}`]),
	].join(" ")
	const stdout = execSync(cmd, {
		cwd: process.cwd(),
		encoding: "utf8",
	})
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.filter(
			(line) =>
				!line.endsWith("src/modules/search/application/use-cases/materialize-search-unit.ts")
		)
		.filter((line) => !line.includes("/materialize-"))
		.sort()
}

describe("Guardrail: search runtime side-effects", () => {
	it("blocks write/backfill side-effect patterns in search runtime paths", () => {
		const files = listSearchRuntimeFiles()
		expect(files.length).toBeGreaterThan(0)

		const violations: string[] = []
		for (const relativePath of files) {
			const content = readFileSync(join(process.cwd(), relativePath), "utf8")
			for (const rule of BANNED) {
				rule.pattern.lastIndex = 0
				if (rule.pattern.test(content)) {
					violations.push(`${relativePath} -> ${rule.name}`)
				}
			}
		}

		expect(
			violations,
			`Found forbidden side-effects in search runtime:\n${violations.join("\n")}`
		).toEqual([])
	})
})
