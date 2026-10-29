export function tourTerritoryCodes(
	context: { jurisdictionCodes?: unknown; jurisdictionCode?: string | null } | null | undefined
): string[] {
	const values = Array.isArray(context?.jurisdictionCodes)
		? context.jurisdictionCodes
		: context?.jurisdictionCode
			? [context.jurisdictionCode]
			: []
	return [
		...new Set(
			values.filter((value): value is string => typeof value === "string" && value.length > 0)
		),
	]
}
