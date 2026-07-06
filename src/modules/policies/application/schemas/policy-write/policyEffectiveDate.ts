const POLICY_EFFECTIVE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isCanonicalPolicyEffectiveDate(value: string): boolean {
	const match = POLICY_EFFECTIVE_DATE_PATTERN.exec(value)
	if (!match) return false

	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	const date = new Date(Date.UTC(year, month - 1, day))

	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	)
}

export function normalizePolicyEffectiveDate(value: string | null | undefined): string | null {
	if (value == null) return null
	const normalized = value.trim()
	return isCanonicalPolicyEffectiveDate(normalized) ? normalized : null
}
