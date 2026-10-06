import {
	withWorkspaceNavigationScope,
	workspaceNavigationScopeFromSearchParams,
	type WorkspaceNavigationScope,
} from "@/lib/workspace/verticalContext"

function readFinancialNavigationScopeFromContext(): WorkspaceNavigationScope {
	if (typeof document === "undefined") {
		return { vertical: null, productId: null }
	}
	const context = document.getElementById("financialScopeContext")
	const vertical = String(context?.dataset.vertical ?? "").trim()
	const productId = String(context?.dataset.productId ?? "").trim()
	return {
		vertical: vertical ? (vertical as WorkspaceNavigationScope["vertical"]) : null,
		productId: productId || null,
	}
}

export function currentFinancialNavigationScope(
	location?: Pick<Location, "search">
): WorkspaceNavigationScope {
	const search = location?.search ?? (typeof window !== "undefined" ? window.location.search : "")
	const fromUrl = workspaceNavigationScopeFromSearchParams(new URLSearchParams(search))
	if (fromUrl.vertical || fromUrl.productId) return fromUrl
	return readFinancialNavigationScopeFromContext()
}

export function withFinancialNavigationScope(
	href: string,
	scope: WorkspaceNavigationScope = currentFinancialNavigationScope()
): string {
	return withWorkspaceNavigationScope(href, scope)
}

/** Current financial view (path + query) so the booking detail can offer a way back into the case. */
export function financialReturnTo(location?: Pick<Location, "pathname" | "search">): string | null {
	const pathname =
		location?.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "")
	if (!pathname.startsWith("/financial")) return null
	const search = location?.search ?? (typeof window !== "undefined" ? window.location.search : "")
	return withFinancialNavigationScope(
		`${pathname}${search}`,
		currentFinancialNavigationScope(location)
	)
}

export function financialBookingDetailHref(
	bookingId: unknown,
	location?: Pick<Location, "pathname" | "search">
): string {
	const id = String(bookingId ?? "").trim()
	const scope = currentFinancialNavigationScope(location)
	if (!id) return withFinancialNavigationScope("/booking", scope)
	const returnTo = financialReturnTo(location)
	const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
	return withFinancialNavigationScope(`/booking/${encodeURIComponent(id)}${query}`, scope)
}
