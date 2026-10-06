import { financialUrlWithParams } from "./financial-data-cache"

export function readFinancialScopeSearchParams(): Record<string, string> {
	const context = document.getElementById("financialScopeContext")
	if (!context) return {}
	const params: Record<string, string> = {}
	const vertical = String(context.dataset.vertical || "").trim()
	const productId = String(context.dataset.productId || "").trim()
	if (vertical) params.scope = vertical
	if (productId) params.productId = productId
	return params
}

export function withFinancialApiScope(url: string): string {
	return financialUrlWithParams(url, readFinancialScopeSearchParams())
}
