import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const RUNTIME_ROOT = join(process.cwd(), "src")
const EXCLUDED_SEGMENTS = ["/scripts/", "/test-support/", "/__tests__/", "/__mocks__/"]
const BANNED_PATTERNS = [/a\$\{[^}]+\}_c\$\{[^}]+\}_i\$\{[^}]+\}/g, /\ba\d+_c\d+_i\d+\b/g]
const ALLOWED_FILES = [join(process.cwd(), "src/shared/domain/occupancy.ts")]

function isExcluded(path: string): boolean {
	return EXCLUDED_SEGMENTS.some((segment) => path.includes(segment))
}

function listSourceFiles(dir: string): string[] {
	const entries = readdirSync(dir)
	const files: string[] = []
	for (const entry of entries) {
		const fullPath = join(dir, entry)
		const stats = statSync(fullPath)
		if (stats.isDirectory()) {
			if (!isExcluded(fullPath)) files.push(...listSourceFiles(fullPath))
			continue
		}
		if (!/\.(ts|tsx|astro|js|mjs|cjs)$/.test(fullPath)) continue
		if (isExcluded(fullPath)) continue
		files.push(fullPath)
	}
	return files
}

describe("Occupancy key guardrail", () => {
	it("blocks manual occupancy key builders in src runtime", () => {
		const violations: string[] = []
		for (const file of listSourceFiles(RUNTIME_ROOT)) {
			if (ALLOWED_FILES.includes(file)) continue
			const content = readFileSync(file, "utf8")
			for (const pattern of BANNED_PATTERNS) {
				pattern.lastIndex = 0
				if (pattern.test(content)) {
					violations.push(`${relative(process.cwd(), file)} -> ${pattern}`)
				}
			}
		}
		expect(
			violations,
			`Found forbidden manual occupancy key construction in runtime:\n${violations.join("\n")}`
		).toEqual([])
	})
})
