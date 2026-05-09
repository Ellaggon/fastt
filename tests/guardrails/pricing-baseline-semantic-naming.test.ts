import { describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

function listPricingUseCaseFiles(): string[] {
	const stdout = execSync('rg --files -g "src/modules/pricing/application/use-cases/**/*.ts"', {
		cwd: process.cwd(),
		encoding: "utf8",
	})
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.sort()
}

describe("Guardrail: pricing baseline semantic naming", () => {
	it("prevents legacy base-rate contract naming in pricing core use-cases", () => {
		const files = listPricingUseCaseFiles()
		const violations: string[] = []

		for (const relativePath of files) {
			const source = readFileSync(join(process.cwd(), relativePath), "utf8")
			if (/\bBaseRateRepositoryPort\b(?!["'])/.test(source)) {
				violations.push(`${relativePath} -> BaseRateRepositoryPort`)
			}
			if (/\bgetCanonicalBaseByRatePlanId\s*\(/.test(source)) {
				violations.push(`${relativePath} -> getCanonicalBaseByRatePlanId`)
			}
			if (/\bsetCanonicalBaseForRatePlan\s*\(/.test(source)) {
				violations.push(`${relativePath} -> setCanonicalBaseForRatePlan`)
			}
		}

		expect(
			violations,
			`Found legacy base-rate naming in pricing use-cases:\n${violations.join("\n")}`
		).toEqual([])
	})
})

