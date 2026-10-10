/** Formats describe the product; discovery themes and regulated activities remain separate. */
export const EXPERIENCE_FORMATS = ["guided_tour", "workshop", "class", "tasting"] as const
export type ExperienceFormat = (typeof EXPERIENCE_FORMATS)[number]

export function isExperienceFormat(value: unknown): value is ExperienceFormat {
	return EXPERIENCE_FORMATS.some((format) => format === value)
}

/** Null on contract 0 is historical, never an inference from categories or the product name. */
export function experienceFormatReady(input: {
	experienceFormat?: unknown
	formatContractVersion?: number | null
}): boolean {
	return (
		isExperienceFormat(input.experienceFormat) ||
		(input.experienceFormat == null && (input.formatContractVersion ?? 0) === 0)
	)
}

export function experienceProgramMinimum(format: unknown): number {
	return format == null || format === "guided_tour" ? 3 : 1
}

export function experienceFormatSnapshot(input: {
	experienceFormat: unknown
	formatContractVersion: number
}) {
	return {
		version: "experience_classification_v1" as const,
		format: isExperienceFormat(input.experienceFormat) ? input.experienceFormat : null,
		contractVersion: input.formatContractVersion,
	}
}

export class ExperienceFormatError extends Error {
	constructor(readonly code: "invalid_format" | "product_not_owned") {
		super(code)
	}
}
