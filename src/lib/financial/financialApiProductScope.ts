import { getProviderSidebarData } from "@/lib/dashboard/providerSidebarReadiness"
import { resolveWorkspaceScope } from "@/lib/workspace/resolveWorkspaceScope"
import { listProviderCommercialLines } from "@/lib/verification/commercial-lines"
import { db, eq, Product } from "@/shared/infrastructure/db/compat"

/** null = no product-line filter (all provider bookings). [] = filter matches nothing. */
export type FinancialApiProductFilter = string[] | null

export type FinancialApiProductScopeResult =
	| { ok: true; productFilter: FinancialApiProductFilter }
	| { ok: false; response: Response }

function scopeJsonError(reason: string, requestedScope: string): Response {
	return new Response(
		JSON.stringify({ error: "invalid_workspace_scope", reason, requestedScope }),
		{
			status: 400,
			headers: { "Content-Type": "application/json" },
		}
	)
}

export async function resolveFinancialApiProductScope(
	providerId: string,
	url: URL
): Promise<FinancialApiProductScopeResult> {
	const requestedScope = url.searchParams.get("scope") ?? url.searchParams.get("vertical")
	const requestedProductId = String(url.searchParams.get("productId") ?? "").trim()
	if (!requestedScope && !requestedProductId) {
		return { ok: true, productFilter: null }
	}

	const [sidebarData, commercialLines, catalogProducts] = await Promise.all([
		getProviderSidebarData(providerId),
		listProviderCommercialLines(providerId).catch(() => []),
		db
			.select({ id: Product.id, name: Product.name, productType: Product.productType })
			.from(Product)
			.where(eq(Product.providerId, providerId)),
	])

	const products = catalogProducts.map((row) => ({
		id: String(row.id),
		name: String(row.name || row.productType || "Servicio"),
		productType: String(row.productType ?? ""),
	}))

	const resolution = resolveWorkspaceScope({
		requestedScope,
		productId: requestedProductId,
		productTypes: sidebarData.productTypes ?? [],
		commercialLines: commercialLines.map((entry) => entry.line),
		products,
	})

	if (!resolution.valid) {
		return { ok: false, response: scopeJsonError(resolution.reason, resolution.requestedScope) }
	}

	if (resolution.product) {
		return { ok: true, productFilter: [resolution.product.id] }
	}
	if (resolution.vertical) {
		return { ok: true, productFilter: resolution.productIds }
	}
	return { ok: true, productFilter: null }
}
