import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { listFilesUnderRoot } from "./_file-utils"

function listPricingUseCaseFiles(): string[] {
	return listFilesUnderRoot("src/modules/pricing/application/use-cases")
}

describe("Guardrail: pricing baseline semantic naming", () => {
	it("blocks expansion of legacy base-rate naming outside audited scope", () => {
		const files = listPricingUseCaseFiles()
		const violations: string[] = []
		const allowlist = new Set([
			"src/modules/pricing/application/use-cases/compute-price-preview.ts",
			"src/modules/pricing/application/use-cases/create-default-price-rule.ts",
			"src/modules/pricing/application/use-cases/set-base-rate.ts",
			"src/modules/pricing/application/use-cases/update-default-price-rule.ts",
		])

		for (const relativePath of files) {
			const source = readFileSync(join(process.cwd(), relativePath), "utf8")
			if (/\bBaseRateRepositoryPort\b(?!["'])/.test(source) && !allowlist.has(relativePath)) {
				violations.push(`${relativePath} -> BaseRateRepositoryPort`)
			}
			if (/\bgetCanonicalBaseByRatePlanId\s*\(/.test(source) && !allowlist.has(relativePath)) {
				violations.push(`${relativePath} -> getCanonicalBaseByRatePlanId`)
			}
			if (/\bsetCanonicalBaseForRatePlan\s*\(/.test(source) && !allowlist.has(relativePath)) {
				violations.push(`${relativePath} -> setCanonicalBaseForRatePlan`)
			}
		}

		expect(
			violations,
			`Found legacy base-rate naming in pricing use-cases:\n${violations.join("\n")}`
		).toEqual([])
	})
})
