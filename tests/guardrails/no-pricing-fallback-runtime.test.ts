import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const RUNTIME_ROOT = join(process.cwd(), "src")
const EXCLUDED_SEGMENTS = ["/scripts/", "/test-support/", "/__tests__/", "/__mocks__/"]
const BANNED_PATTERNS = [
	/\bv1PricePerNight\b/g,
	/\bhasV1Price\b/g,
	/search_v2_primary_fallback_total/g,
	/\bv1_[A-Za-z0-9_]+\b/g,
]

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

describe("Pricing fallback runtime guardrail", () => {
	it("blocks semantic fallback markers in src runtime", () => {
		const violations: string[] = []
		for (const file of listSourceFiles(RUNTIME_ROOT)) {
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
			`Found forbidden pricing fallback references in runtime:\n${violations.join("\n")}`
		).toEqual([])
	})
})
