import { db, eq, ProductContent } from "astro:db"

import { logger } from "@/lib/observability/logger"
import { listHouseRulesByProduct } from "@/modules/house-rules/public"
import { resolveEffectivePolicies } from "@/modules/policies/public"
import type { EffectiveRule } from "../../domain/rule.entities"
import { mapHouseRulesToRules } from "../adapters/house-rule-to-rule.adapter"
import { mapResolvedPoliciesToRules } from "../adapters/policy-to-rule.adapter"
import { mapProductContentRulesToRule } from "../adapters/product-content-rules-to-rule.adapter"

export type ResolveEffectiveRulesInput = {
	productId: string
	variantId?: string
	ratePlanId?: string
	checkIn?: string
	checkOut?: string
	channel?: string
	requiredCategories?: string[]
	onMissingCategory?: "return_null" | "throw_error"
	includeProductContentRules?: boolean
}

export type ResolveEffectiveRulesResult = {
	hardConstraints: EffectiveRule[]
	contractTerms: EffectiveRule[]
	informativeRules: EffectiveRule[]
	allRules: EffectiveRule[]
	conflicts: Array<{ code: string; count: number; layers: string[]; sources: string[] }>
}

function sortDeterministic(items: EffectiveRule[]): EffectiveRule[] {
	return [...items].sort((a, b) => {
		if (a.group.layer !== b.group.layer) return a.group.layer.localeCompare(b.group.layer)
		if (a.group.code !== b.group.code)
			return String(a.group.code).localeCompare(String(b.group.code))
		if (a.source !== b.source) return a.source.localeCompare(b.source)
		if (a.version.id !== b.version.id) return a.version.id.localeCompare(b.version.id)
		return (a.assignment?.id ?? "").localeCompare(b.assignment?.id ?? "")
	})
}

function detectConflicts(items: EffectiveRule[]): Array<{
	code: string
	count: number
	layers: string[]
	sources: string[]
}> {
	const buckets = new Map<string, EffectiveRule[]>()
	for (const item of items) {
		const key = String(item.group.code)
		const bucket = buckets.get(key) ?? []
		bucket.push(item)
		buckets.set(key, bucket)
	}

	return [...buckets.entries()]
		.filter(([, bucket]) => bucket.length > 1)
		.map(([code, bucket]) => ({
			code,
			count: bucket.length,
			layers: [...new Set(bucket.map((item) => item.group.layer))].sort((a, b) =>
				a.localeCompare(b)
			),
			sources: [...new Set(bucket.map((item) => item.source))].sort((a, b) => a.localeCompare(b)),
		}))
		.sort((a, b) => a.code.localeCompare(b.code))
}

async function readProductContentRulesText(productId: string): Promise<string | null> {
	const row = await db
		.select({ rules: ProductContent.rules })
		.from(ProductContent)
		.where(eq(ProductContent.productId, productId))
		.get()
	const value = row?.rules == null ? null : String(row.rules).trim()
	return value && value.length > 0 ? value : null
}

export async function resolveEffectiveRules(
	input: ResolveEffectiveRulesInput
): Promise<ResolveEffectiveRulesResult> {
	const productId = String(input.productId ?? "").trim()
	if (!productId) {
		return {
			hardConstraints: [],
			contractTerms: [],
			informativeRules: [],
			allRules: [],
			conflicts: [],
		}
	}

	const [resolvedPolicies, houseRules, productRulesText] = await Promise.all([
		resolveEffectivePolicies({
			productId,
			variantId: input.variantId,
			ratePlanId: input.ratePlanId,
			checkIn: input.checkIn,
			checkOut: input.checkOut,
			channel: input.channel,
			requiredCategories: input.requiredCategories,
			onMissingCategory: input.onMissingCategory,
		}),
		listHouseRulesByProduct(productId),
		input.includeProductContentRules === false
			? Promise.resolve(null)
			: readProductContentRulesText(productId),
	])

	const policyRules = mapResolvedPoliciesToRules({
		resolved: resolvedPolicies,
		context: {
			productId,
			variantId: input.variantId,
			ratePlanId: input.ratePlanId,
			channel: input.channel ?? null,
		},
	})
	const infoHouseRules = mapHouseRulesToRules({
		houseRules: houseRules as Array<{
			id: string
			productId: string
			type: string
			description: string
			createdAt: string
		}>,
	})
	const productContentRules = mapProductContentRulesToRule({
		productId,
		rulesText: productRulesText,
	})

	const allRules = sortDeterministic([...policyRules, ...infoHouseRules, ...productContentRules])
	const hardConstraints = allRules.filter((rule) => rule.group.layer === "HARD")
	const contractTerms = allRules.filter((rule) => rule.group.layer === "CONTRACT")
	const informativeRules = allRules.filter((rule) => rule.group.layer === "INFO")
	const conflicts = detectConflicts(allRules)

	logger.info("rules.resolution.summary", {
		productId,
		variantId: input.variantId ?? null,
		ratePlanId: input.ratePlanId ?? null,
		channel: input.channel ?? null,
		total: allRules.length,
		hardConstraints: hardConstraints.length,
		contractTerms: contractTerms.length,
		informativeRules: informativeRules.length,
		conflicts: conflicts.length,
	})
	logger.debug("rules.resolution.evaluation", {
		context: {
			productId,
			variantId: input.variantId ?? null,
			ratePlanId: input.ratePlanId ?? null,
			checkIn: input.checkIn ?? null,
			checkOut: input.checkOut ?? null,
			channel: input.channel ?? null,
			requiredCategories: input.requiredCategories ?? [],
			onMissingCategory: input.onMissingCategory ?? "return_null",
		},
		policyResolution: {
			policiesFound: Array.isArray(resolvedPolicies?.policies)
				? resolvedPolicies.policies.length
				: 0,
			missingCategories: Array.isArray(resolvedPolicies?.missingCategories)
				? resolvedPolicies.missingCategories
				: [],
		},
		output: {
			totalRules: allRules.length,
			hardConstraints: hardConstraints.length,
			contractTerms: contractTerms.length,
			informativeRules: informativeRules.length,
			conflicts: conflicts.length,
		},
	})

	if (conflicts.length > 0) {
		logger.warn("rules.resolution.conflicts", {
			productId,
			variantId: input.variantId ?? null,
			ratePlanId: input.ratePlanId ?? null,
			conflicts,
		})
	}

	logger.debug("rules.resolution.sources", {
		productId,
		policyRules: policyRules.length,
		houseRules: infoHouseRules.length,
		productContentRules: productContentRules.length,
	})

	return {
		hardConstraints,
		contractTerms,
		informativeRules,
		allRules,
		conflicts,
	}
}
