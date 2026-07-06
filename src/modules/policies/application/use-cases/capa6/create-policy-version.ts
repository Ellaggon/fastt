import {
	createPolicySchema,
	type CreatePolicyInput,
} from "../../schemas/policy-write/createPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"
import { validatePolicyContentForCategory } from "../../schemas/policy-write/policyContentSchema"
import { applyPolicyPresetDefaults } from "../../presets/applyPolicyPreset"
import { normalizePolicyEffectiveDate } from "../../schemas/policy-write/policyEffectiveDate"

export type CreatePolicyVersionInput = Omit<CreatePolicyInput, "category"> & {
	previousPolicyId: string
	// category is derived from group; must not be user-controlled for versioning.
	category?: never
	actorUserId?: string
}

function assertNonOverlappingRange(params: {
	nextFrom: string | null
	nextTo: string | null
	existing: Array<{ id: string; effectiveFrom: string | null; effectiveTo: string | null }>
}) {
	for (const row of params.existing) {
		const startsBeforeCurrentEnds =
			params.nextFrom == null || row.effectiveTo == null || params.nextFrom <= row.effectiveTo
		const currentStartsBeforeEnd =
			row.effectiveFrom == null || params.nextTo == null || row.effectiveFrom <= params.nextTo
		const overlaps = startsBeforeCurrentEnds && currentStartsBeforeEnd
		if (overlaps) {
			throw new PolicyValidationError([
				{
					path: ["effectiveFrom", "effectiveTo"],
					code: "effective_range_overlap",
					message: `Overlaps with policy ${row.id}`,
				},
			])
		}
	}
}

// Booking.com style versioning:
// - Never edit an existing policy row
// - Always create a new active version in the same group
// - Do not touch assignments (they point to groupId)
export async function createPolicyVersionCapa6(
	deps: { commandRepo: PolicyCommandRepositoryPortCapa6 },
	input: CreatePolicyVersionInput
): Promise<{ policyId: string; groupId: string; category: string; version: number }> {
	// Reuse the existing schema for payload shape, but enforce previousPolicyId as required.
	const parsedInput = createPolicySchema.parse({
		...input,
		// placeholder; will be replaced by derived category
		category: "Other" as any,
	})

	if (!parsedInput.previousPolicyId) {
		throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "required" }])
	}

	const prev = await deps.commandRepo.getPolicyById(parsedInput.previousPolicyId)
	if (!prev) throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "not_found" }])

	const groupId = prev.groupId
	const group = await deps.commandRepo.getPolicyGroupById(groupId)
	if (!group)
		throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "group_not_found" }])

	const category = group.category
	const maxV = await deps.commandRepo.getMaxPolicyVersionByGroupId(groupId)
	const version = Number(maxV) + 1
	const parsed = applyPolicyPresetDefaults({ input, parsed: parsedInput, category })

	const content = validatePolicyContentForCategory({
		category,
		rules: parsed.rules,
		cancellationTiers: parsed.cancellationTiers,
	})

	const effectiveFrom = normalizePolicyEffectiveDate(parsed.effectiveFrom)
	const effectiveTo = normalizePolicyEffectiveDate(parsed.effectiveTo)
	if (parsed.effectiveFrom && !effectiveFrom) {
		throw new PolicyValidationError([{ path: ["effectiveFrom"], code: "invalid_date" }])
	}
	if (parsed.effectiveTo && !effectiveTo) {
		throw new PolicyValidationError([{ path: ["effectiveTo"], code: "invalid_date" }])
	}
	if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
		throw new PolicyValidationError([
			{ path: ["effectiveFrom", "effectiveTo"], code: "invalid_date_range" },
		])
	}
	if (effectiveFrom || effectiveTo) {
		const activeVersions = await deps.commandRepo.listActivePoliciesByGroupId(groupId)
		assertNonOverlappingRange({
			nextFrom: effectiveFrom,
			nextTo: effectiveTo,
			existing: activeVersions,
		})
	}

	const { policyId } = await deps.commandRepo.createPolicyVersion({
		groupId,
		description: parsed.description ?? "",
		version,
		status: parsed.status,
		effectiveFrom,
		effectiveTo,
		metadata: {
			policyPresetKey:
				input.policyPresetKey === undefined ? prev.policyPresetKey : parsed.policyPresetKey,
			stayLengthType:
				input.stayLengthType === undefined ? prev.stayLengthType : parsed.stayLengthType,
			gracePeriod: input.gracePeriod === undefined ? prev.gracePeriod : parsed.gracePeriod,
			refundBasis: input.refundBasis === undefined ? prev.refundBasis : parsed.refundBasis,
			payoutBasis: input.payoutBasis === undefined ? prev.payoutBasis : parsed.payoutBasis,
			localTimezone: input.localTimezone === undefined ? prev.localTimezone : parsed.localTimezone,
		},
	})

	const rulesArray = content.rules
		? Object.entries(content.rules).map(([ruleKey, ruleValue]) => ({ ruleKey, ruleValue }))
		: []

	await deps.commandRepo.replacePolicyRules({ policyId, rules: rulesArray })

	if (category === "Cancellation" && content.cancellationTiers) {
		await deps.commandRepo.replaceCancellationTiers({
			policyId,
			tiers: content.cancellationTiers,
		})
	}

	await deps.commandRepo.createAuditLog({
		eventType: "policy_version_created",
		actorUserId: input.actorUserId ?? null,
		policyId,
		policyGroupId: groupId,
		before: { previousPolicyId: parsed.previousPolicyId },
		after: {
			policyId,
			version,
			category,
			effectiveFrom,
			effectiveTo,
		},
	})

	return { policyId, groupId, category, version }
}
