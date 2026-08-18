import {
	activeProductVerticals,
	getProductVerticalEntry,
	normalizeProductVertical,
	type ProductVertical,
} from "@/lib/catalog/productVerticalRegistry"

export type WorkspaceContextLevel = "company" | "vertical" | "product"
export type ActiveWorkspaceVertical = Exclude<ProductVertical, "generic" | "rental">

export type ProviderWorkspaceContext = {
	level: WorkspaceContextLevel
	availableVerticals: ActiveWorkspaceVertical[]
	vertical: ActiveWorkspaceVertical | null
	productId: string | null
}

/**
 * URL-scoped operational context. It never decides permissions or the
 * workspace experience; it only establishes the business slice being viewed.
 */
export type WorkspaceOperationalContext = ProviderWorkspaceContext

export type WorkspaceNavigationScope = {
	vertical: ActiveWorkspaceVertical | null
	productId: string | null
}

export type WorkspaceScopeOption = {
	vertical: ActiveWorkspaceVertical
	label: string
}

function isActiveWorkspaceVertical(value: ProductVertical): value is ActiveWorkspaceVertical {
	return (activeProductVerticals as readonly string[]).includes(value)
}

/**
 * Defines the three scopes used by provider-facing surfaces:
 * company for governance and consolidated data, vertical for operational
 * vocabulary and filters, and product for a concrete sellable offer.
 */
export function resolveProviderWorkspaceContext(input: {
	productTypes?: readonly unknown[]
	vertical?: unknown
	productId?: string | null
}): ProviderWorkspaceContext {
	const availableVerticals = [
		...new Set(
			(input.productTypes ?? []).map(normalizeProductVertical).filter(isActiveWorkspaceVertical)
		),
	]
	const requestedVertical = normalizeProductVertical(input.vertical)
	const vertical =
		isActiveWorkspaceVertical(requestedVertical) && availableVerticals.includes(requestedVertical)
			? requestedVertical
			: null
	const productId = String(input.productId ?? "").trim() || null

	if (productId) {
		return { level: "product", availableVerticals, vertical, productId }
	}
	if (vertical) {
		return { level: "vertical", availableVerticals, vertical, productId: null }
	}
	return { level: "company", availableVerticals, vertical: null, productId: null }
}

/** URL-backed workspace scope. URLs are shareable; clients may remember it as a preference. */
export function resolveWorkspaceNavigationScope(input: {
	productTypes?: readonly unknown[]
	searchParams: URLSearchParams
}): WorkspaceNavigationScope {
	const context = resolveProviderWorkspaceContext({
		productTypes: input.productTypes,
		vertical: input.searchParams.get("scope") ?? input.searchParams.get("vertical"),
		productId: input.searchParams.get("productId"),
	})
	return { vertical: context.vertical, productId: context.productId }
}

export function resolveWorkspaceOperationalContext(input: {
	productTypes?: readonly unknown[]
	searchParams: URLSearchParams
}): WorkspaceOperationalContext {
	return resolveProviderWorkspaceContext({
		productTypes: input.productTypes,
		vertical: input.searchParams.get("scope") ?? input.searchParams.get("vertical"),
		productId: input.searchParams.get("productId"),
	})
}

/**
 * Builds the scope options exposed by the workspace shell. The current provider
 * membership grants catalog visibility at the provider level; allowedVerticals
 * keeps this boundary ready for future product or vertical-specific grants.
 */
export function resolveWorkspaceScopeOptions(input: {
	productTypes?: readonly unknown[]
	canAccessWorkspace: boolean
	allowedVerticals?: readonly unknown[]
}): WorkspaceScopeOption[] {
	if (!input.canAccessWorkspace) return []

	const availableVerticals = resolveProviderWorkspaceContext({
		productTypes: input.productTypes,
	}).availableVerticals
	const allowedVerticals = input.allowedVerticals
		? new Set(
				input.allowedVerticals.map(normalizeProductVertical).filter(isActiveWorkspaceVertical)
			)
		: null

	return availableVerticals
		.filter((vertical) => !allowedVerticals || allowedVerticals.has(vertical))
		.map((vertical) => ({
			vertical,
			label: getProductVerticalEntry(vertical).labels.workspacePlural,
		}))
}

export function withWorkspaceNavigationScope(
	href: string,
	scope: WorkspaceNavigationScope
): string {
	const [path, hash = ""] = href.split("#", 2)
	const [pathname, rawQuery = ""] = path.split("?", 2)
	const query = new URLSearchParams(rawQuery)
	query.delete("scope")
	query.delete("vertical")
	query.delete("productId")
	if (scope.vertical) query.set("scope", scope.vertical)
	if (scope.productId) query.set("productId", scope.productId)
	const encoded = query.toString()
	return `${pathname}${encoded ? `?${encoded}` : ""}${hash ? `#${hash}` : ""}`
}
