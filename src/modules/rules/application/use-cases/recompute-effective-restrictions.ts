import type { RestrictionScope } from "../../domain/restrictions/restrictions.types"

export type RecomputeEffectiveRestrictionsForVariantRangeInput = {
	variantId: string
	from: string
	to: string
	reason?: string
}

export type RecomputeEffectiveRestrictionsForScopeInput = {
	scope: RestrictionScope
	scopeId: string
	from: string
	to: string
	reason?: string
}

export type RecomputeEffectiveRestrictionsResult = {
	variantIds: string[]
	ratePlanIds: string[]
	from: string
	to: string
	rows: number
}

export type EffectiveRestrictionsMaterializerPort = {
	recomputeForVariantRange: (
		input: RecomputeEffectiveRestrictionsForVariantRangeInput
	) => Promise<RecomputeEffectiveRestrictionsResult>
	recomputeForScope: (
		input: RecomputeEffectiveRestrictionsForScopeInput
	) => Promise<RecomputeEffectiveRestrictionsResult>
	toExclusiveRestrictionDate: (endDateInclusive: string) => string
}

let materializer: EffectiveRestrictionsMaterializerPort | null = null

export function configureEffectiveRestrictionsMaterializer(
	nextMaterializer: EffectiveRestrictionsMaterializerPort
): void {
	materializer = nextMaterializer
}

function resolveMaterializer(): EffectiveRestrictionsMaterializerPort {
	if (!materializer) {
		throw new Error("EFFECTIVE_RESTRICTIONS_MATERIALIZER_NOT_CONFIGURED")
	}
	return materializer
}

export async function recomputeEffectiveRestrictionsForVariantRange(
	input: RecomputeEffectiveRestrictionsForVariantRangeInput
): Promise<RecomputeEffectiveRestrictionsResult> {
	return resolveMaterializer().recomputeForVariantRange(input)
}

export async function recomputeEffectiveRestrictionsForScope(
	input: RecomputeEffectiveRestrictionsForScopeInput
): Promise<RecomputeEffectiveRestrictionsResult> {
	return resolveMaterializer().recomputeForScope(input)
}

export function toExclusiveRestrictionDate(endDateInclusive: string): string {
	return resolveMaterializer().toExclusiveRestrictionDate(endDateInclusive)
}
