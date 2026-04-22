import type { APIRoute } from "astro"
import { z } from "zod"

import {
	evaluateRulesUiReadiness,
	resolveRulesUiFlagValue,
	resolveRulesUiRollout,
	RULES_UI_ROLLOUT_COOKIE,
} from "@/lib/feature-flags/rules-ui-rollout"
import {
	recordRulesUiDecisionTrace,
	recordRulesUiEvaluation,
	recordRulesUiFallback,
	recordRulesUiMismatch,
} from "@/lib/observability/rules-ui-validation"
import {
	buildPolicySnapshot,
	mapResolvedPoliciesToUI,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { resolveRatePlanOwnerContext } from "@/modules/pricing/public"
import { logger } from "@/lib/observability/logger"
import {
	buildRuleSnapshot,
	comparePolicyAndRuleSnapshots,
	mapRuleSnapshotToPolicyCards,
	resolveEffectiveRules,
} from "@/modules/rules/public"

const querySchema = z.object({
	productId: z.string().min(1).optional(),
	variantId: z.string().min(1).optional(),
	ratePlanId: z.string().min(1).optional(),
	checkIn: z.string().min(1),
	checkOut: z.string().min(1),
	channel: z.string().min(1).optional(),
	includeTrace: z
		.string()
		.optional()
		.transform((value) => value === "1" || value === "true"),
})

export const GET: APIRoute = async ({ url, cookies }) => {
	const cookieRolloutId = String(cookies.get(RULES_UI_ROLLOUT_COOKIE)?.value ?? "").trim()
	const rollout = resolveRulesUiRollout({
		flagValue: resolveRulesUiFlagValue(
			import.meta.env.RULES_UI_ENABLED,
			import.meta.env.PUBLIC_RULES_UI_ENABLED,
			process.env.RULES_UI_ENABLED,
			process.env.PUBLIC_RULES_UI_ENABLED
		),
		rolloutId: cookieRolloutId,
		createRolloutId: () => crypto.randomUUID(),
	})
	if (!cookieRolloutId) {
		cookies.set(RULES_UI_ROLLOUT_COOKIE, rollout.rolloutId, {
			path: "/",
			maxAge: 60 * 60 * 24 * 180,
			sameSite: "lax",
			httpOnly: false,
		})
	}
	const parsed = querySchema.safeParse({
		productId: String(url.searchParams.get("productId") ?? "").trim() || undefined,
		variantId: String(url.searchParams.get("variantId") ?? "").trim() || undefined,
		ratePlanId: String(url.searchParams.get("ratePlanId") ?? "").trim() || undefined,
		checkIn: String(url.searchParams.get("checkIn") ?? "").trim(),
		checkOut: String(url.searchParams.get("checkOut") ?? "").trim(),
		channel: String(url.searchParams.get("channel") ?? "").trim() || undefined,
		includeTrace: String(url.searchParams.get("includeTrace") ?? "").trim() || undefined,
	})

	if (!parsed.success) {
		return new Response(
			JSON.stringify({ error: "validation_error", details: parsed.error.issues }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}

	try {
		const input = parsed.data
		if (!input.ratePlanId) {
			logger.warn("rateplan_id_required", {
				endpoint: "api.policies.resolve",
			})
			return new Response(JSON.stringify({ error: "ratePlanId_required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (input.checkOut <= input.checkIn) {
			logger.warn("invalid_stay_range", {
				endpoint: "api.policies.resolve",
				checkIn: input.checkIn,
				checkOut: input.checkOut,
			})
			return new Response(JSON.stringify({ error: "invalid_stay_range" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const clientProductId = String(input.productId ?? "").trim()
		const clientVariantId = String(input.variantId ?? "").trim()
		const ratePlanId = String(input.ratePlanId ?? "").trim() || undefined
		const ownerContext = ratePlanId ? await resolveRatePlanOwnerContext(ratePlanId) : null
		if (ratePlanId && !ownerContext) {
			logger.warn("rateplan_owner_context_not_found", {
				endpoint: "api.policies.resolve",
				ratePlanId,
			})
			return new Response(JSON.stringify({ error: "ratePlan_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (ratePlanId && ownerContext) {
			const hasMismatch =
				(clientProductId && clientProductId !== ownerContext.productId) ||
				(clientVariantId && clientVariantId !== ownerContext.variantId)
			if (hasMismatch) {
				logger.warn("rateplan_owner_context_mismatch_ignored", {
					endpoint: "api.policies.resolve",
					ratePlanId,
					clientProductId: clientProductId || null,
					clientVariantId: clientVariantId || null,
					derivedProductId: ownerContext.productId,
					derivedVariantId: ownerContext.variantId,
				})
			}
		}
		const productId = String(ownerContext?.productId ?? "").trim()
		const variantId = String(ownerContext?.variantId ?? "").trim() || undefined
		if (!productId) {
			return new Response(JSON.stringify({ error: "ratePlan_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const resolved = await resolveEffectivePolicies({
			productId,
			variantId,
			ratePlanId,
			checkIn: input.checkIn,
			checkOut: input.checkOut,
			channel: input.channel ?? "web",
			includeTrace: input.includeTrace,
		})
		let policies = mapResolvedPoliciesToUI(resolved)
		recordRulesUiEvaluation({
			endpoint: "api.policies.resolve",
			hotelId: productId,
			supplierId: null,
			ratePlanId: ratePlanId ?? null,
			sessionHash: rollout.rolloutHash,
			enabled: rollout.enabled,
			rolloutPercentage: rollout.percentage,
			rolloutBucket: rollout.bucket,
		})
		if (rollout.enabled) {
			try {
				const resolvedRules = await resolveEffectiveRules({
					productId,
					variantId,
					ratePlanId,
					checkIn: input.checkIn,
					checkOut: input.checkOut,
					channel: input.channel ?? "web",
					requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
					onMissingCategory: "return_null",
				})
				const ruleSnapshot = buildRuleSnapshot({ resolvedRules })
				const compared = comparePolicyAndRuleSnapshots(
					buildPolicySnapshot({
						resolvedPolicies: resolved,
						checkIn: input.checkIn,
						checkOut: input.checkOut,
						channel: input.channel ?? "web",
					}),
					ruleSnapshot
				)
				if (!compared.isConsistent) {
					recordRulesUiMismatch({
						endpoint: "api.policies.resolve",
						hotelId: productId,
						supplierId: null,
						ratePlanId: ratePlanId ?? null,
						sessionHash: rollout.rolloutHash,
						input: {
							checkIn: input.checkIn,
							checkOut: input.checkOut,
							variantId: variantId ?? null,
							channel: input.channel ?? "web",
						},
						mismatches: compared.mismatches,
						policySnapshot: buildPolicySnapshot({
							resolvedPolicies: resolved,
							checkIn: input.checkIn,
							checkOut: input.checkOut,
							channel: input.channel ?? "web",
						}),
						ruleSnapshot,
					})
				}
				const readiness = evaluateRulesUiReadiness({
					hasRuleSnapshot:
						Array.isArray(ruleSnapshot.contractTerms) && ruleSnapshot.contractTerms.length > 0,
					hasMapperError: false,
					hasMismatch: !compared.isConsistent,
				})
				recordRulesUiDecisionTrace({
					endpoint: "api.policies.resolve",
					inputContext: {
						hotelId: productId,
						ratePlanId: ratePlanId ?? null,
						supplierId: null,
						variantId: variantId ?? null,
						channel: input.channel ?? "web",
						occupancy: null,
						checkIn: input.checkIn,
						checkOut: input.checkOut,
					},
					policiesResolved: resolved.policies.map((item) => ({
						category: String(item?.category ?? ""),
						resolvedFromScope: String(item?.resolvedFromScope ?? ""),
						policyId: String(item?.policy?.id ?? ""),
						version: Number(item?.policy?.version ?? 0),
					})),
					requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
					policiesByCategory: resolved.policies.reduce(
						(acc, item) => {
							const key = String(item?.category ?? "").trim()
							if (!key) return acc
							acc[key] = Number(acc[key] ?? 0) + 1
							return acc
						},
						{} as Record<string, number>
					),
					rulesFound: Array.isArray(resolvedRules?.allRules) ? resolvedRules.allRules.length : 0,
					rulesMatched: Array.isArray(ruleSnapshot?.contractTerms)
						? ruleSnapshot.contractTerms.length
						: 0,
					rulesEvaluated: Array.isArray(resolvedRules?.allRules)
						? resolvedRules.allRules.map((rule) => ({
								category: String(rule?.group?.category ?? ""),
								code: String(rule?.group?.code ?? ""),
								layer: String(rule?.group?.layer ?? ""),
								source: String(rule?.source ?? ""),
								resolvedFromScope: String(rule?.resolvedFromScope ?? ""),
								version: Number(rule?.version?.version ?? 0),
							}))
						: [],
					finalOutput: {
						policiesCount: Array.isArray(policies) ? policies.length : 0,
						comparisonConsistent: Boolean(compared?.isConsistent),
					},
					fallbackReason: readiness.useRulesUi ? null : (readiness.fallbackReason ?? "unknown"),
				})
				if (readiness.useRulesUi) {
					policies = mapRuleSnapshotToPolicyCards(ruleSnapshot) as any
				} else {
					recordRulesUiFallback({
						endpoint: "api.policies.resolve",
						hotelId: productId,
						supplierId: null,
						ratePlanId: ratePlanId ?? null,
						sessionHash: rollout.rolloutHash,
						reason: readiness.fallbackReason ?? "unknown",
					})
				}
			} catch (rulesError) {
				recordRulesUiDecisionTrace({
					endpoint: "api.policies.resolve",
					inputContext: {
						hotelId: productId,
						ratePlanId: ratePlanId ?? null,
						supplierId: null,
						variantId: variantId ?? null,
						channel: input.channel ?? "web",
						occupancy: null,
						checkIn: input.checkIn,
						checkOut: input.checkOut,
					},
					policiesResolved: resolved.policies.map((item) => ({
						category: String(item?.category ?? ""),
						resolvedFromScope: String(item?.resolvedFromScope ?? ""),
						policyId: String(item?.policy?.id ?? ""),
						version: Number(item?.policy?.version ?? 0),
					})),
					requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
					policiesByCategory: resolved.policies.reduce(
						(acc, item) => {
							const key = String(item?.category ?? "").trim()
							if (!key) return acc
							acc[key] = Number(acc[key] ?? 0) + 1
							return acc
						},
						{} as Record<string, number>
					),
					rulesFound: 0,
					rulesMatched: 0,
					rulesEvaluated: [],
					finalOutput: {
						policiesCount: Array.isArray(policies) ? policies.length : 0,
						error: "mapper_error",
					},
					fallbackReason: "mapper_error",
				})
				recordRulesUiFallback({
					endpoint: "api.policies.resolve",
					hotelId: productId,
					supplierId: null,
					ratePlanId: ratePlanId ?? null,
					sessionHash: rollout.rolloutHash,
					reason: "mapper_error",
				})
				console.warn("rules_ui_mapper_error", {
					endpoint: "api.policies.resolve",
					hotelId: productId,
					ratePlanId: ratePlanId ?? null,
					error: rulesError,
				})
			}
		}
		return new Response(
			JSON.stringify({
				productId,
				variantId,
				ratePlanId,
				checkIn: input.checkIn,
				checkOut: input.checkOut,
				channel: input.channel ?? "web",
				policies,
				trace: input.includeTrace ? (resolved.trace ?? null) : null,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		logger.error("policies_resolve_unhandled_error", {
			endpoint: "api.policies.resolve",
			error: error instanceof Error ? error.message : String(error),
		})
		return new Response(JSON.stringify({ error: "internal_error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
