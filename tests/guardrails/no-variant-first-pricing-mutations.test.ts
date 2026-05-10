import { describe, expect, it } from "vitest"
import { listFilesUnderRoot } from "./_file-utils"
import { readSource } from "./_guardrail-scanner"

function listPricingMutationFiles(): string[] {
	return listFilesUnderRoot("src/pages/api/pricing")
}

function isMutationEndpoint(content: string): boolean {
	return /\bexport\s+const\s+(POST|PUT|PATCH|DELETE)\s*:/.test(content)
}

describe("Guardrail: no variant-first pricing mutations", () => {
	it("requires explicit ratePlanId validation/resolution for pricing mutation endpoints", () => {
		const files = listPricingMutationFiles()
		const violations: string[] = []

		for (const relativePath of files) {
			const content = readSource(relativePath)
			if (!isMutationEndpoint(content)) continue

			const hasSingularRatePlanRequirement =
				/\bratePlanId\b/.test(content) &&
				(/ratePlanId is required for pricing mutations/.test(content) ||
					/ratePlanId_required/.test(content) ||
					/ratePlanId_and_ruleId_required/.test(content) ||
					/\bratePlanId:\s*z\.string\(\)\.min\(1\)/.test(content) ||
					/resolveRatePlanOwnerContext\s*\(/.test(content) ||
					/resolveOwnedRatePlanContext\s*\(/.test(content))
			const hasPluralRatePlanRequirement =
				/\bratePlanIds\b/.test(content) &&
				(/\bratePlanIds:\s*z\.array\s*\(\s*z\.string\(\)\.min\(1\)\s*\)\.min\(1\)/.test(content) ||
					/ratePlanIds_required/.test(content))
			const hasRatePlanRequirement = hasSingularRatePlanRequirement || hasPluralRatePlanRequirement

			if (!hasRatePlanRequirement) {
				violations.push(`${relativePath} -> missing explicit ratePlanId enforcement`)
			}

			if (/resolveRatePlanIdFromLegacyInput\s*\(/.test(content)) {
				violations.push(`${relativePath} -> forbidden legacy variant->ratePlan adapter`)
			}
			if (/\b(?:getDefaultByVariant|ensureDefaultRatePlan)\s*\(/.test(content)) {
				violations.push(`${relativePath} -> forbidden default-rate-plan fallback`)
			}

			// variantId may exist for ownership/invalidation context, but it cannot be used alone.
			const hasVariantUsage = /\bvariantId\b/.test(content)
			const hasExplicitAdapter = /resolveRatePlanOwnerContext\s*\(/.test(content)
			const hasVariantOwnershipCheck =
				/ratePlan_variant_mismatch/.test(content) ||
				/parsed\.variantId\s*&&\s*parsed\.variantId\s*!==\s*variantId/.test(content)
			if (
				hasVariantUsage &&
				!hasExplicitAdapter &&
				!hasVariantOwnershipCheck &&
				!/\bownerContext\b/.test(content) &&
				!/\bratePlanId\b/.test(content)
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
