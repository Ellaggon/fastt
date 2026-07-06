import { and, asc, db, desc, eq, Policy, PolicyGroup, PolicyRule, CancellationTier } from "astro:db"

import {
	clonePolicyPresetCancellationTiers,
	clonePolicyPresetRules,
	resolvePolicyPreset,
} from "@/data/policy/policy-presets"
import {
	createPolicyCapa6,
	PolicyValidationError,
	type PolicyCategory,
} from "@/modules/policies/public"

function normalizedJson(value: unknown): string {
	function normalize(item: unknown): unknown {
		if (Array.isArray(item)) return item.map(normalize)
		if (item && typeof item === "object") {
			return Object.fromEntries(
				Object.entries(item as Record<string, unknown>)
					.sort(([left], [right]) => left.localeCompare(right))
					.map(([key, nested]) => [key, normalize(nested)])
			)
		}
		return item
	}
	return JSON.stringify(normalize(value))
}

function sameValue(left: unknown, right: unknown): boolean {
	return normalizedJson(left) === normalizedJson(right)
}

export async function getOrCreateProviderPresetPolicy(params: {
	providerId: string
	actorUserId?: string
	category: PolicyCategory
	policyPresetKey: string
}): Promise<{ policyId: string; groupId: string; reused: boolean }> {
	const preset = resolvePolicyPreset(params.policyPresetKey, params.category)
	if (!preset) {
		throw new PolicyValidationError([{ path: ["policyPresetKey"], code: "unknown_preset" }])
	}

	const candidates = await db
		.select({
			id: Policy.id,
			groupId: Policy.groupId,
			stayLengthType: Policy.stayLengthType,
			gracePeriod: Policy.gracePeriod,
			refundBasis: Policy.refundBasis,
			payoutBasis: Policy.payoutBasis,
			localTimezone: Policy.localTimezone,
		})
		.from(Policy)
		.innerJoin(PolicyGroup, eq(PolicyGroup.id, Policy.groupId))
		.where(
			and(
				eq(Policy.status, "active"),
				eq(Policy.policyPresetKey, preset.key),
				eq(PolicyGroup.ownerProviderId, params.providerId),
				eq(PolicyGroup.category, params.category)
			)
		)
		.orderBy(desc(Policy.version), asc(Policy.id))
		.all()

	const expectedRules = clonePolicyPresetRules(preset)
	const expectedTiers = (clonePolicyPresetCancellationTiers(preset) ?? []).sort(
		(left, right) => right.daysBeforeArrival - left.daysBeforeArrival
	)

	for (const candidate of candidates) {
		const [ruleRows, tierRows] = await Promise.all([
			db
				.select({ key: PolicyRule.ruleKey, value: PolicyRule.ruleValue })
				.from(PolicyRule)
				.where(eq(PolicyRule.policyId, candidate.id))
				.all(),
			db
				.select({
					daysBeforeArrival: CancellationTier.daysBeforeArrival,
					penaltyType: CancellationTier.penaltyType,
					penaltyAmount: CancellationTier.penaltyAmount,
				})
				.from(CancellationTier)
				.where(eq(CancellationTier.policyId, candidate.id))
				.orderBy(desc(CancellationTier.daysBeforeArrival))
				.all(),
		])
		const rules = Object.fromEntries(
			ruleRows.filter((row) => row.key != null).map((row) => [String(row.key), row.value])
		)
		const tiers = tierRows.map((row) => ({
			daysBeforeArrival: Number(row.daysBeforeArrival),
			penaltyType: String(row.penaltyType),
			penaltyAmount: Number(row.penaltyAmount),
		}))
		const metadataMatches =
			String(candidate.stayLengthType ?? "") === preset.stayLengthType &&
			Number(candidate.gracePeriod ?? 0) === preset.gracePeriod &&
			String(candidate.refundBasis ?? "") === preset.refundBasis &&
			String(candidate.payoutBasis ?? "") === preset.payoutBasis &&
			String(candidate.localTimezone ?? "") === preset.localTimezone

		if (metadataMatches && sameValue(rules, expectedRules) && sameValue(tiers, expectedTiers)) {
			return {
				policyId: String(candidate.id),
				groupId: String(candidate.groupId),
				reused: true,
			}
		}
	}

	const created = await createPolicyCapa6({
		ownerProviderId: params.providerId,
		actorUserId: params.actorUserId,
		category: params.category,
		status: "active",
		policyPresetKey: preset.key,
	})
	return { policyId: created.policyId, groupId: created.groupId, reused: false }
}
