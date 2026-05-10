import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { listFilesUnderRoot } from "./_file-utils"

describe("Guardrail: pricing baseline semantic naming", () => {
	it("blocks legacy base-rate naming in pricing core modules", () => {
		const files = listFilesUnderRoot("src/modules/pricing")
		const violations: string[] = []

		for (const relativePath of files) {
			const source = readFileSync(join(process.cwd(), relativePath), "utf8")
			if (/\bBaseRateRepositoryPort\b(?!["'])/.test(source)) {
				violations.push(`${relativePath} -> BaseRateRepositoryPort`)
			}
			if (/\bCanonicalBaseRateSnapshot\b/.test(source)) {
				violations.push(`${relativePath} -> CanonicalBaseRateSnapshot`)
			}
			if (/\bgetCanonicalBaseByRatePlanId\s*\(/.test(source)) {
				violations.push(`${relativePath} -> getCanonicalBaseByRatePlanId`)
			}
			if (/\bsetCanonicalBaseForRatePlan\s*\(/.test(source)) {
				violations.push(`${relativePath} -> setCanonicalBaseForRatePlan`)
			}
			if (/\bgetBaseRateByRatePlanId\s*\(/.test(source)) {
				violations.push(`${relativePath} -> getBaseRateByRatePlanId`)
			}
			if (/\bsetBaseRateSchema\b/.test(source)) {
				violations.push(`${relativePath} -> setBaseRateSchema`)
			}
			if (/\bsetBaseRate\b/.test(source)) {
				violations.push(`${relativePath} -> setBaseRate`)
			}
		}

		expect(
			violations,
			`Found legacy base-rate naming in pricing modules:\n${violations.join("\n")}`
		).toEqual([])
	})
})
