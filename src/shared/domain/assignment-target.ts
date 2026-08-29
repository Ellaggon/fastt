/**
 * Storage shape for a commercial assignment target.
 *
 * `scope` is useful to resolve inheritance, while the concrete target is
 * enforced by a single foreign key. Callers keep passing a scope/id pair at
 * their boundary; persistence must use this mapper instead of a polymorphic
 * `scopeId` column.
 */
export type AssignmentTargetScope = "provider" | "product" | "variant" | "rate_plan"

export type TypedAssignmentTarget = {
	providerTargetId: string | null
	productTargetId: string | null
	variantTargetId: string | null
	ratePlanTargetId: string | null
}

export function typedAssignmentTarget(
	scope: AssignmentTargetScope,
	targetId: string
): TypedAssignmentTarget {
	const normalizedTargetId = String(targetId ?? "").trim()
	if (!normalizedTargetId) throw new Error("ASSIGNMENT_TARGET_ID_REQUIRED")

	return {
		providerTargetId: scope === "provider" ? normalizedTargetId : null,
		productTargetId: scope === "product" ? normalizedTargetId : null,
		variantTargetId: scope === "variant" ? normalizedTargetId : null,
		ratePlanTargetId: scope === "rate_plan" ? normalizedTargetId : null,
	}
}

export function typedCatalogAssignmentTarget(
	scope: Exclude<AssignmentTargetScope, "provider">,
	targetId: string
): Omit<TypedAssignmentTarget, "providerTargetId"> {
	const target = typedAssignmentTarget(scope, targetId)
	return {
		productTargetId: target.productTargetId,
		variantTargetId: target.variantTargetId,
		ratePlanTargetId: target.ratePlanTargetId,
	}
}
