import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const RUNTIME_ROOT = join(process.cwd(), "src")
const BANNED_PATTERNS = [/\bEffectivePricing\b/g, /\bPricingBaseRate\b/g]
const EXCLUDED_SEGMENTS = ["/scripts/", "/test-support/", "/__tests__/", "/__mocks__/"]

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

describe("Pricing V1 runtime guardrail", () => {
	it("blocks EffectivePricing/PricingBaseRate references in src runtime", () => {
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
			`Found forbidden V1 pricing references in runtime:\n${violations.join("\n")}`
		).toEqual([])
	})
})
