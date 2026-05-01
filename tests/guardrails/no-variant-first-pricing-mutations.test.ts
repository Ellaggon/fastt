import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

function listPricingMutationFiles(): string[] {
	return [
		"src/pages/api/pricing/rule.ts",
		"src/pages/api/pricing/rule-update.ts",
		"src/pages/api/pricing/rule-delete.ts",
		"src/pages/api/pricing/preview.ts",
		"src/pages/api/pricing/preview-rules.ts",
	]
}

function isMutationEndpoint(content: string): boolean {
	return /\bexport\s+const\s+(POST|PUT|PATCH|DELETE)\s*:/.test(content)
}

describe("Guardrail: no variant-first pricing mutations", () => {
	it("requires explicit ratePlanId validation/resolution for pricing mutation endpoints", () => {
		const files = listPricingMutationFiles()
		const violations: string[] = []

		for (const relativePath of files) {
			const content = readFileSync(join(process.cwd(), relativePath), "utf8")
			if (!isMutationEndpoint(content)) continue

			const hasRatePlanRequirement =
				/\bratePlanId\b/.test(content) &&
				(/ratePlanId is required for pricing mutations/.test(content) ||
					/resolveRatePlanIdFromLegacyInput\s*\(/.test(content) ||
					/resolveRatePlanOwnerContext\s*\(/.test(content))

			if (!hasRatePlanRequirement) {
				violations.push(`${relativePath} -> missing explicit ratePlanId enforcement`)
			}

			// variantId may exist for ownership/invalidation context, but it cannot be used alone.
			const hasVariantUsage = /\bvariantId\b/.test(content)
			const hasExplicitAdapter = /resolveRatePlanIdFromLegacyInput\s*\(/.test(content)
			if (
				hasVariantUsage &&
				!hasExplicitAdapter &&
				!/resolveRatePlanOwnerContext\s*\(/.test(content)
			) {
				violations.push(`${relativePath} -> variantId present without explicit ratePlan adapter`)
			}
		}

		expect(
			violations,
			`Found variant-first mutation paths without explicit ratePlan enforcement:\n${violations.join("\n")}`
		).toEqual([])
	})
})
