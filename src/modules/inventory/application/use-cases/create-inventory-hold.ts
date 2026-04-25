import { createHash } from "node:crypto"
import { z } from "zod"

import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"
import * as persistentCache from "@/lib/cache/persistentCache"
import { cacheKeys } from "@/lib/cache/cacheKeys"
import { buildPolicySnapshot, type ResolveEffectivePoliciesResult } from "@/modules/policies/public"
import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import {
	buildRuleBasedContractSnapshot,
	buildRuleSnapshot,
	comparePolicyContractVsRuleContract,
	comparePolicyAndRuleSnapshots,
	type ResolveEffectiveRulesResult,
} from "@/modules/rules/public"

const createInventoryHoldSchema = z.object({
	variantId: z.string().min(1),
	dateRange: z.object({
		from: z.string().min(1),
		to: z.string().min(1),
	}),
	occupancy: z.number().int().min(1),
	sessionId: z.string().min(1),
})

export type CreateInventoryHoldInput = z.infer<typeof createInventoryHoldSchema>

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function toStableUuidFromString(value: string): string {
	const hash = createHash("sha1").update(value).digest("hex")
	const bytes = hash.slice(0, 32).split("")
	// UUID v5 layout bits (deterministic hash-based)
	bytes[12] = "5"
	const variantNibble = parseInt(bytes[16], 16)
	bytes[16] = ((variantNibble & 0x3) | 0x8).toString(16)
	const normalized = bytes.join("")
	return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`
}

function buildIdempotencyHoldId(input: {
	sessionId: string
	variantId: string
	from: string
	to: string
}): string {
	const key = `hold:${input.sessionId}:${input.variantId}:${input.from}:${input.to}`
	return toStableUuidFromString(key)
}

export async function createInventoryHold(
	deps: {
		repo: InventoryHoldRepositoryPort
		resolvePricingSnapshot: (params: {
			variantId: string
			from: string
			to: string
			occupancy: number
		}) => Promise<unknown | null>
		resolveEffectivePolicies: (ctx: {
			productId: string
			variantId?: string
			ratePlanId?: string
			checkIn?: string
			checkOut?: string
			channel?: string
			requiredCategories?: string[]
			onMissingCategory?: "return_null" | "throw_error"
		}) => Promise<ResolveEffectivePoliciesResult>
		resolveEffectiveRules?: (ctx: {
			productId: string
			variantId?: string
			ratePlanId?: string
			checkIn?: string
			checkOut?: string
			channel?: string
			requiredCategories?: string[]
			onMissingCategory?: "return_null" | "throw_error"
			includeProductContentRules?: boolean
		}) => Promise<ResolveEffectiveRulesResult>
		policyContext: {
			productId: string
			ratePlanId: string
			channel?: string | null
		}
	},
	input: CreateInventoryHoldInput
): Promise<{ holdId: string; expiresAt: Date }> {
	const parsed = createInventoryHoldSchema.parse(input)
	const checkIn = parseDateOnly(parsed.dateRange.from)
	const checkOut = parseDateOnly(parsed.dateRange.to)

	if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["dateRange"],
				message: "Invalid date range",
			},
		])
	}

	const now = new Date()
	const policyRatePlanId = String(deps.policyContext.ratePlanId ?? "").trim()
	if (!policyRatePlanId) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["ratePlanId"],
				message: "Missing ratePlanId policy context",
			},
		])
	}
	const holdId = buildIdempotencyHoldId({
		sessionId: parsed.sessionId,
		variantId: parsed.variantId,
		from: parsed.dateRange.from,
		to: parsed.dateRange.to,
	})

	const existing = await deps.repo.findActiveHold({ holdId, now })
	if (existing) {
		return {
			holdId: existing.holdId,
			expiresAt: existing.expiresAt,
		}
	}

	const expiresAt = new Date(now.getTime() + 10 * 60 * 1000)
	const pricingSnapshot = await deps.resolvePricingSnapshot({
		variantId: parsed.variantId,
		from: parsed.dateRange.from,
		to: parsed.dateRange.to,
		occupancy: parsed.occupancy,
	})
	const resolvedPolicies = await deps.resolveEffectivePolicies({
		productId: deps.policyContext.productId,
		variantId: parsed.variantId,
		ratePlanId: policyRatePlanId,
		checkIn: parsed.dateRange.from,
		checkOut: parsed.dateRange.to,
		channel: deps.policyContext.channel == null ? undefined : String(deps.policyContext.channel),
	})
	const ruleResolution = deps.resolveEffectiveRules
		? await deps.resolveEffectiveRules({
				productId: deps.policyContext.productId,
				variantId: parsed.variantId,
				ratePlanId: policyRatePlanId,
				checkIn: parsed.dateRange.from,
				checkOut: parsed.dateRange.to,
				channel:
					deps.policyContext.channel == null ? undefined : String(deps.policyContext.channel),
			})
		: null
	const ruleSnapshot = ruleResolution
		? buildRuleSnapshot({
				resolvedRules: ruleResolution,
				resolvedAt: now,
			})
		: { contractTerms: [], hardConstraintEvidence: [] }

	const policySnapshot = buildPolicySnapshot({
		resolvedPolicies,
		checkIn: parsed.dateRange.from,
		checkOut: parsed.dateRange.to,
		channel: deps.policyContext.channel,
		resolvedAt: now,
	})
	policySnapshot.ruleSnapshotJson = ruleSnapshot
	const ruleBasedContractSnapshot = buildRuleBasedContractSnapshot({
		ruleSnapshot,
		checkIn: parsed.dateRange.from,
		checkOut: parsed.dateRange.to,
		channel: deps.policyContext.channel,
		resolvedAt: now,
	})
	policySnapshot.ruleBasedContractSnapshot = ruleBasedContractSnapshot

	const contractComparison = comparePolicyContractVsRuleContract(
		policySnapshot,
		ruleBasedContractSnapshot
	)
	policySnapshot.contractComparisonJson = {
		isConsistent: contractComparison.isConsistent,
		diffs: contractComparison.diffs,
		comparedAt: now.toISOString(),
	}
	if (contractComparison.isConsistent) {
		incrementCounter("contract.match_total", { source: "hold_shadow" })
		logger.info("contract.match", {
			holdId,
			productId: deps.policyContext.productId,
			variantId: parsed.variantId,
			ratePlanId: policyRatePlanId,
			checkIn: parsed.dateRange.from,
			checkOut: parsed.dateRange.to,
			diffCount: 0,
		})
	} else {
		incrementCounter("contract.mismatch_total", { source: "hold_shadow" })
		logger.warn("contract.mismatch", {
			holdId,
			productId: deps.policyContext.productId,
			variantId: parsed.variantId,
			ratePlanId: policyRatePlanId,
			checkIn: parsed.dateRange.from,
			checkOut: parsed.dateRange.to,
			diffCount: contractComparison.diffs.length,
			diffs: contractComparison.diffs,
		})
	}

	const comparison = comparePolicyAndRuleSnapshots(policySnapshot, ruleSnapshot)
	const expectedPolicyCategories = [
		policySnapshot.cancellation,
		policySnapshot.payment,
		policySnapshot.no_show,
		policySnapshot.check_in,
	].filter(Boolean).length
	const mismatchCategoryCount = new Set(comparison.mismatches.map((mismatch) => mismatch.category))
		.size
	const fullMismatch =
		!comparison.isConsistent &&
		(expectedPolicyCategories === 0 || mismatchCategoryCount >= expectedPolicyCategories)
	if (comparison.isConsistent) {
		incrementCounter("rules.validation.match")
	} else if (fullMismatch) {
		incrementCounter("rules.validation.full_mismatch")
	} else {
		incrementCounter("rules.validation.partial_mismatch")
	}
	if (process.env.RULE_SNAPSHOT_VALIDATION_DEBUG === "1") {
		policySnapshot.ruleValidationJson = {
			isConsistent: comparison.isConsistent,
			mismatches: comparison.mismatches,
			comparedAt: now.toISOString(),
		}
	}

	if (ruleSnapshot.contractTerms.length === 0) {
		logger.warn("inventory.hold.rule_snapshot_empty_contract_terms", {
			productId: deps.policyContext.productId,
			variantId: parsed.variantId,
			ratePlanId: policyRatePlanId,
			checkIn: parsed.dateRange.from,
			checkOut: parsed.dateRange.to,
		})
	}

	const normalizeCategory = (value: string): string =>
		String(value ?? "")
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "")
	const policyCategorySet = new Set<string>()
	if (policySnapshot.cancellation) policyCategorySet.add("cancellation")
	if (policySnapshot.payment) policyCategorySet.add("payment")
	if (policySnapshot.no_show) policyCategorySet.add("noshow")
	if (policySnapshot.check_in) policyCategorySet.add("checkin")

	const contractCategorySet = new Set(
		ruleSnapshot.contractTerms.map((term) => normalizeCategory(term.category))
	)
	const missingInRuleSnapshot = [...policyCategorySet]
		.filter((cat) => !contractCategorySet.has(cat))
		.sort((a, b) => a.localeCompare(b))
	const additionalInRuleSnapshot = [...contractCategorySet]
		.filter((cat) => !policyCategorySet.has(cat))
		.sort((a, b) => a.localeCompare(b))

	if (missingInRuleSnapshot.length > 0 || additionalInRuleSnapshot.length > 0) {
		logger.warn("inventory.hold.rule_snapshot_mismatch", {
			productId: deps.policyContext.productId,
			variantId: parsed.variantId,
			ratePlanId: policyRatePlanId,
			missingInRuleSnapshot,
			additionalInRuleSnapshot,
		})
	}

	if (!comparison.isConsistent) {
		logger.warn("inventory.hold.rule_validation_mismatch", {
			productId: deps.policyContext.productId,
			variantId: parsed.variantId,
			ratePlanId: policyRatePlanId,
			isConsistent: false,
			classification: fullMismatch ? "full_mismatch" : "partial_mismatch",
			mismatches: comparison.mismatches,
		})
	} else {
		logger.info("inventory.hold.rule_validation_match", {
			productId: deps.policyContext.productId,
			variantId: parsed.variantId,
			ratePlanId: policyRatePlanId,
			isConsistent: true,
		})
	}

	logger.info("inventory.hold.rule_snapshot", {
		productId: deps.policyContext.productId,
		variantId: parsed.variantId,
		ratePlanId: policyRatePlanId,
		contractTermsCount: ruleSnapshot.contractTerms.length,
		hardConstraintEvidenceCount: ruleSnapshot.hardConstraintEvidence.length,
	})
	const created = await deps.repo.holdInventory({
		holdId,
		variantId: parsed.variantId,
		ratePlanId: policyRatePlanId,
		checkIn,
		checkOut,
		quantity: parsed.occupancy,
		expiresAt,
		channel: deps.policyContext.channel,
		policySnapshotJson: policySnapshot,
	})

	if (!created.success) {
		throw new Error("not_available")
	}

	if (pricingSnapshot) {
		void persistentCache
			.set(cacheKeys.holdPricingSnapshot(created.holdId), pricingSnapshot, 10 * 60)
			.catch(() => {})
	}
	void persistentCache
		.set(cacheKeys.holdPolicySnapshot(created.holdId), policySnapshot, 10 * 60)
		.catch(() => {})

	return {
		holdId: created.holdId,
		expiresAt: created.expiresAt,
	}
}
