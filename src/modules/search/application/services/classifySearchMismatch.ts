export type SearchMismatchType = "none" | "critical" | "major" | "minor"

export function classifySearchMismatch(input: {
	baselineIsSellable: boolean
	candidateIsSellable: boolean
	reasonCodeMismatch: boolean
	priceMismatch: boolean
}): SearchMismatchType {
	if (Boolean(input.baselineIsSellable) !== Boolean(input.candidateIsSellable)) {
		return "critical"
	}
	if (input.reasonCodeMismatch) {
		return "major"
	}
	if (input.priceMismatch) {
		return "minor"
	}
	return "none"
}
