import type { FinancialHumanContext } from "./financial-human-display"

export type FinancialAccommodationScope = {
	productId: string
	productName: string
}

function normalize(value: unknown): string {
	return String(value ?? "")
		.trim()
		.toLowerCase()
}

function readPath(source: any, path: string): unknown {
	return path.split(".").reduce((current, key) => current?.[key], source)
}

function valuesFromPaths(source: any, paths: string[]): string[] {
	return paths.map((path) => String(readPath(source, path) ?? "").trim()).filter(Boolean)
}

export function getFinancialAccommodationScope(): FinancialAccommodationScope | null {
	const context = document.getElementById("financialAccommodationContext")
	const productId = String(context?.dataset.productId || "").trim()
	const productName = String(context?.dataset.productName || "").trim()
	if (!productId && !productName) return null
	return { productId, productName }
}

export function itemMatchesAccommodationScope(
	item: any,
	scope: FinancialAccommodationScope | null,
	bookingContext?: Map<string, FinancialHumanContext>
): boolean {
	if (!scope?.productId && !scope?.productName) return true
	const context = bookingContext?.get(String(item?.bookingId || item?.raw?.bookingId || ""))
	const candidateIds = [
		...valuesFromPaths(item, [
			"productId",
			"productIdSnapshot",
			"providerFinance.productId",
			"operation.productId",
			"operation.productIdSnapshot",
			"operation.contract.productId",
			"contract.productId",
			"raw.productId",
			"raw.productIdSnapshot",
			"raw.providerFinance.productId",
			"raw.operation.productId",
			"raw.operation.productIdSnapshot",
			"raw.operation.contract.productId",
			"raw.contract.productId",
		]),
		String(context?.productId ?? "").trim(),
	].filter(Boolean)
	if (scope.productId && candidateIds.includes(scope.productId)) return true

	const scopedName = normalize(scope.productName)
	if (!scopedName) return false
	const candidateNames = [
		...valuesFromPaths(item, [
			"productName",
			"productNameSnapshot",
			"providerFinance.productName",
			"providerFinance.productNameSnapshot",
			"operation.productName",
			"operation.productNameSnapshot",
			"operation.contract.productName",
			"contract.productName",
			"raw.productName",
			"raw.productNameSnapshot",
			"raw.providerFinance.productName",
			"raw.providerFinance.productNameSnapshot",
			"raw.operation.productName",
			"raw.operation.productNameSnapshot",
			"raw.operation.contract.productName",
			"raw.contract.productName",
		]),
		String(context?.productName ?? "").trim(),
	].filter(Boolean)
	return candidateNames.some((name) => normalize(name) === scopedName)
}

export function filterItemsByAccommodationScope<T extends { bookingId?: string; raw?: any }>(
	items: T[],
	scope: FinancialAccommodationScope | null,
	bookingContext?: Map<string, FinancialHumanContext>
): T[] {
	if (!scope?.productId && !scope?.productName) return items
	return items.filter((item) => itemMatchesAccommodationScope(item, scope, bookingContext))
}
