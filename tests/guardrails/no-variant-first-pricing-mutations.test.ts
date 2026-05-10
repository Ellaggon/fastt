import { describe, expect, it } from "vitest"

import { listFilesUnderRoot } from "./_file-utils"
import {
	collectCalls,
	collectHttpExportMethods,
	collectImports,
	collectObjectKeys,
	collectStringLiterals,
} from "./_guardrail-ast"

function listPricingMutationFiles(): string[] {
	return listFilesUnderRoot("src/pages/api/pricing")
}

describe("Guardrail: no variant-first pricing mutations", () => {
	it("requires explicit ratePlanId validation/resolution for pricing mutation endpoints", () => {
		const files = listPricingMutationFiles()
		const violations: string[] = []

		for (const relativePath of files) {
			const methods = collectHttpExportMethods(relativePath)
			if (methods.size === 0) continue

			const objectKeys = new Set(collectObjectKeys(relativePath))
			const literals = new Set(collectStringLiterals(relativePath))
			const imports = collectImports(relativePath)
			const calls = collectCalls(relativePath)

			const hasRatePlanObjectKey =
				objectKeys.has("ratePlanId") || objectKeys.has("ratePlanIds") || literals.has("ratePlanId")
			const hasRatePlanLiteralSignal =
				literals.has("ratePlanId_required") ||
				literals.has("ratePlanIds_required") ||
				literals.has("ratePlanId_and_ruleId_required") ||
				literals.has("ratePlanId is required for pricing mutations")
			const hasRatePlanResolverCall = calls.some(
				(call) =>
					call.leaf === "resolveRatePlanOwnerContext" ||
					call.leaf === "resolveOwnedRatePlanContext" ||
					call.leaf === "requireText"
			)

			const hasRatePlanRequirement =
				hasRatePlanObjectKey &&
				(hasRatePlanLiteralSignal ||
					hasRatePlanResolverCall ||
					calls.some((call) => call.leaf === "safeParse" || call.leaf === "parse"))
			if (!hasRatePlanRequirement) {
				violations.push(`${relativePath} -> missing explicit ratePlanId enforcement`)
			}

			const hasLegacyResolverImport = imports.some(
				(entry) => entry.imported === "resolveRatePlanIdFromLegacyInput"
			)
			const hasLegacyResolverCall = calls.some(
				(call) => call.leaf === "resolveRatePlanIdFromLegacyInput"
			)
			if (hasLegacyResolverImport || hasLegacyResolverCall) {
				violations.push(`${relativePath} -> forbidden legacy variant->ratePlan adapter`)
			}

			const hasFallbackCall = calls.some(
				(call) => call.leaf === "getDefaultByVariant" || call.leaf === "ensureDefaultRatePlan"
			)
			if (hasFallbackCall) {
				violations.push(`${relativePath} -> forbidden default-rate-plan fallback`)
			}

			const hasVariantKey = objectKeys.has("variantId") || literals.has("variantId")
			const hasOwnershipSignal =
				literals.has("rateplan_variant_mismatch_ignored") ||
				literals.has("ratePlan_variant_mismatch") ||
				calls.some((call) => call.leaf === "resolveRatePlanOwnerContext")
			if (hasVariantKey && !hasRatePlanRequirement && !hasOwnershipSignal) {
				violations.push(`${relativePath} -> variant selector present without ratePlan contract`)
			}
		}

		expect(
			violations,
			`Found variant-first mutation paths without explicit ratePlan enforcement:\n${violations.join("\n")}`
		).toEqual([])
	})
})
