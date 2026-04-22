import {
	createPolicySchema,
	type CreatePolicyInput,
} from "../../schemas/policy-write/createPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"

export type CreatePolicyVersionInput = Omit<CreatePolicyInput, "category"> & {
	previousPolicyId: string
	// category is derived from group; must not be user-controlled for versioning.
	category?: never
	actorUserId?: string
}

function normalizeDateIso(raw: string | null | undefined): string | null {
	if (!raw) return null
	const parsed = new Date(raw)
	if (Number.isNaN(parsed.getTime())) return null
	return parsed.toISOString()
}

function assertNonOverlappingRange(params: {
	nextFrom: string | null
	nextTo: string | null
	existing: Array<{ id: string; effectiveFrom: string | null; effectiveTo: string | null }>
}) {
	const nextStart = params.nextFrom ? new Date(params.nextFrom).getTime() : Number.NEGATIVE_INFINITY
	const nextEnd = params.nextTo ? new Date(params.nextTo).getTime() : Number.POSITIVE_INFINITY
	for (const row of params.existing) {
		const currentStart = row.effectiveFrom
			? new Date(row.effectiveFrom).getTime()
			: Number.NEGATIVE_INFINITY
		const currentEnd = row.effectiveTo
			? new Date(row.effectiveTo).getTime()
			: Number.POSITIVE_INFINITY
		const overlaps = nextStart <= currentEnd && currentStart <= nextEnd
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

function assertCancellationTierConsistency(
	tiers: Array<{
		daysBeforeArrival: number
		penaltyType: "percentage" | "nights"
		penaltyAmount: number
	}>
) {
	const byDay = new Set<number>()
	for (const tier of tiers) {
		if (byDay.has(tier.daysBeforeArrival)) {
			throw new PolicyValidationError([
				{ path: ["cancellationTiers"], code: "duplicate_days_before_arrival" },
			])
		}
		byDay.add(tier.daysBeforeArrival)
		if (tier.penaltyType === "percentage" && (tier.penaltyAmount < 0 || tier.penaltyAmount > 100)) {
			throw new PolicyValidationError([
				{ path: ["cancellationTiers"], code: "invalid_percentage_penalty" },
			])
		}
	}

	const sorted = [...tiers].sort((a, b) => b.daysBeforeArrival - a.daysBeforeArrival)
	let prevPenalty = -Infinity
	for (const tier of sorted) {
		if (tier.penaltyAmount < prevPenalty) {
			throw new PolicyValidationError([
				{
					path: ["cancellationTiers"],
					code: "non_monotonic_penalty",
					message: "Penalty must not decrease as arrival gets closer",
				},
			])
		}
		prevPenalty = tier.penaltyAmount
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
	const parsed = createPolicySchema.parse({
		...input,
		// placeholder; will be replaced by derived category
		category: "Other" as any,
	})

	if (!parsed.previousPolicyId) {
		throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "required" }])
	}

	const prev = await deps.commandRepo.getPolicyById(parsed.previousPolicyId)
	if (!prev) throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "not_found" }])

	const groupId = prev.groupId
	const group = await deps.commandRepo.getPolicyGroupById(groupId)
	if (!group)
		throw new PolicyValidationError([{ path: ["previousPolicyId"], code: "group_not_found" }])

	const category = group.category
	const maxV = await deps.commandRepo.getMaxPolicyVersionByGroupId(groupId)
	const version = Number(maxV) + 1

	// Validate cancellation structure if category demands it.
	if (
		category === "Cancellation" &&
		(!parsed.cancellationTiers || parsed.cancellationTiers.length === 0)
	) {
		throw new PolicyValidationError([{ path: ["cancellationTiers"], code: "required" }])
	}

	const effectiveFromIso = normalizeDateIso(parsed.effectiveFrom)
	const effectiveToIso = normalizeDateIso(parsed.effectiveTo)
	if (parsed.effectiveFrom && !effectiveFromIso) {
		throw new PolicyValidationError([{ path: ["effectiveFrom"], code: "invalid_date" }])
	}
	if (parsed.effectiveTo && !effectiveToIso) {
		throw new PolicyValidationError([{ path: ["effectiveTo"], code: "invalid_date" }])
	}
	if (effectiveFromIso && effectiveToIso && new Date(effectiveFromIso) > new Date(effectiveToIso)) {
		throw new PolicyValidationError([
			{ path: ["effectiveFrom", "effectiveTo"], code: "invalid_date_range" },
		])
	}
	if (effectiveFromIso || effectiveToIso) {
		const activeVersions = await deps.commandRepo.listActivePoliciesByGroupId(groupId)
		assertNonOverlappingRange({
			nextFrom: effectiveFromIso,
			nextTo: effectiveToIso,
			existing: activeVersions,
		})
	}

	const { policyId } = await deps.commandRepo.createPolicyVersion({
		groupId,
		description: parsed.description ?? "",
		version,
		status: "active",
		effectiveFromIso,
		effectiveToIso,
	})

	const rulesArray = parsed.rules
		? Object.entries(parsed.rules).map(([ruleKey, ruleValue]) => ({ ruleKey, ruleValue }))
		: []

	await deps.commandRepo.replacePolicyRules({ policyId, rules: rulesArray })

	if (category === "Cancellation" && parsed.cancellationTiers) {
		assertCancellationTierConsistency(parsed.cancellationTiers)
		await deps.commandRepo.replaceCancellationTiers({ policyId, tiers: parsed.cancellationTiers })
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
			effectiveFrom: effectiveFromIso,
			effectiveTo: effectiveToIso,
		},
	})

	return { policyId, groupId, category, version }
}
