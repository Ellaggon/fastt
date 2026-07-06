import { isCanonicalPolicyEffectiveDate } from "../schemas/policy-write/policyEffectiveDate"

export type ExistingPolicyDateAssignment = {
	id: string
	policyGroupId: string
	effectiveFrom: string
	effectiveTo: string
	createdAt: Date
}

export type PolicyDateAssignmentSegment = {
	sourceAssignmentId: string
	policyGroupId: string
	effectiveFrom: string
	effectiveTo: string
	createdAt: Date
}

export type PolicyDateAssignmentRangePlan = {
	deactivateIds: string[]
	preservedSegments: PolicyDateAssignmentSegment[]
	replacement: {
		policyGroupId: string
		effectiveFrom: string
		effectiveTo: string
	} | null
}

function shiftDate(value: string, days: number): string {
	const date = new Date(`${value}T12:00:00.000Z`)
	if (Number.isNaN(date.getTime())) throw new Error("INVALID_POLICY_ASSIGNMENT_DATE")
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

export function planPolicyDateAssignmentRangeChange(params: {
	existing: ExistingPolicyDateAssignment[]
	effectiveFrom: string
	effectiveTo: string
	replacementPolicyGroupId: string | null
}): PolicyDateAssignmentRangePlan {
	if (
		!isCanonicalPolicyEffectiveDate(params.effectiveFrom) ||
		!isCanonicalPolicyEffectiveDate(params.effectiveTo) ||
		params.effectiveFrom > params.effectiveTo
	) {
		throw new Error("INVALID_POLICY_ASSIGNMENT_DATE_RANGE")
	}

	const overlapping = params.existing.filter(
		(assignment) =>
			assignment.effectiveFrom <= params.effectiveTo &&
			assignment.effectiveTo >= params.effectiveFrom
	)
	const preservedSegments: PolicyDateAssignmentSegment[] = []

	for (const assignment of overlapping) {
		if (assignment.effectiveFrom < params.effectiveFrom) {
			preservedSegments.push({
				sourceAssignmentId: assignment.id,
				policyGroupId: assignment.policyGroupId,
				effectiveFrom: assignment.effectiveFrom,
				effectiveTo: shiftDate(params.effectiveFrom, -1),
				createdAt: assignment.createdAt,
			})
		}
		if (assignment.effectiveTo > params.effectiveTo) {
			preservedSegments.push({
				sourceAssignmentId: assignment.id,
				policyGroupId: assignment.policyGroupId,
				effectiveFrom: shiftDate(params.effectiveTo, 1),
				effectiveTo: assignment.effectiveTo,
				createdAt: assignment.createdAt,
			})
		}
	}

	return {
		deactivateIds: overlapping.map((assignment) => assignment.id),
		preservedSegments,
		replacement: params.replacementPolicyGroupId
			? {
					policyGroupId: params.replacementPolicyGroupId,
					effectiveFrom: params.effectiveFrom,
					effectiveTo: params.effectiveTo,
				}
			: null,
	}
}
