import type { PolicyResolutionDTO } from "@/modules/policies/application/dto/PolicyResolutionDTO"

export type LegacyPolicyResolutionResult = {
	policies: PolicyResolutionDTO["policies"]
	missingCategories: string[]
}

export function mapLegacyToDTO(
	legacy: LegacyPolicyResolutionResult,
	input: {
		asOfDate: string
		warnings?: string[]
		missingDates?: string[]
	}
): PolicyResolutionDTO {
	const missingCategories = Array.isArray(legacy?.missingCategories)
		? legacy.missingCategories.map((category) => String(category))
		: []
	const warnings = Array.isArray(input?.warnings)
		? input.warnings.map((warning) => String(warning))
		: []
	const missingDates = Array.isArray(input?.missingDates)
		? input.missingDates.map((date) => String(date))
		: []
	return {
		version: "v2",
		policies: Array.isArray(legacy?.policies) ? legacy.policies : [],
		missingCategories,
		coverage: {
			hasFullCoverage: missingCategories.length === 0,
			...(missingDates.length > 0 ? { missingDates } : {}),
		},
		asOfDate: String(input?.asOfDate ?? ""),
		warnings,
	}
}

export function mapDTOToLegacy(dto: PolicyResolutionDTO): LegacyPolicyResolutionResult {
	return {
		policies: Array.isArray(dto?.policies) ? dto.policies : [],
		missingCategories: Array.isArray(dto?.missingCategories)
			? dto.missingCategories.map((category) => String(category))
			: [],
	}
}

export function isPolicyResolutionDTO(value: unknown): value is PolicyResolutionDTO {
	const candidate = value as PolicyResolutionDTO | null
	if (!candidate || typeof candidate !== "object") return false
	if (candidate.version !== "v2") return false
	if (!Array.isArray(candidate.policies)) return false
	if (!Array.isArray(candidate.missingCategories)) return false
	if (!candidate.coverage || typeof candidate.coverage !== "object") return false
	if (typeof candidate.coverage.hasFullCoverage !== "boolean") return false
	if (typeof candidate.asOfDate !== "string") return false
	if (!Array.isArray(candidate.warnings)) return false
	return true
}

export function normalizePolicyResolutionResult(
	value: PolicyResolutionDTO | LegacyPolicyResolutionResult,
	input: {
		asOfDate: string
		warnings?: string[]
		missingDates?: string[]
	}
): { dto: PolicyResolutionDTO; contractPath: "v2" | "legacy" } {
	if (isPolicyResolutionDTO(value)) {
		return {
			dto: value,
			contractPath: "v2",
		}
	}
	return {
		dto: mapLegacyToDTO(value, input),
		contractPath: "legacy",
	}
}
