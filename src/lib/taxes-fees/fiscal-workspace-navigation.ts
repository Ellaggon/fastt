export type FiscalWorkspaceTab = "definitions" | "assignments" | "simulator" | "activity"

const TAB_OWNED_QUERY_KEYS: Record<FiscalWorkspaceTab, readonly string[]> = {
	definitions: ["edit", "review", "create", "duplicate", "suggestion"],
	simulator: ["definitionId", "mode", "returnTo"],
	assignments: ["definitionId", "targetScope", "targetId"],
	activity: ["view"],
}

function copyParam(target: URLSearchParams, source: URLSearchParams, key: string) {
	const value = source.get(key)?.trim()
	if (value) target.set(key, value)
}

export function fiscalWorkspaceTabFromPathname(pathname: string): FiscalWorkspaceTab {
	const path = pathname.replace(/\/+$/, "")
	if (path.endsWith("/simulator")) return "simulator"
	if (path.endsWith("/assignments")) return "assignments"
	if (path.endsWith("/activity")) return "activity"
	return "definitions"
}

export function fiscalWorkspaceTabSearchParams(input: {
	tab: FiscalWorkspaceTab
	active: FiscalWorkspaceTab
	search: URLSearchParams
}): URLSearchParams {
	const params = new URLSearchParams()
	copyParam(params, input.search, "scope")
	if (input.tab === input.active) {
		for (const key of TAB_OWNED_QUERY_KEYS[input.tab]) {
			copyParam(params, input.search, key)
		}
	}
	return params
}

export function fiscalWorkspaceTabHref(input: {
	href: string
	tab: FiscalWorkspaceTab
	active: FiscalWorkspaceTab
	search: URLSearchParams
}): string {
	const query = fiscalWorkspaceTabSearchParams(input).toString()
	return query ? `${input.href}?${query}` : input.href
}

export function fiscalWorkspaceScopeHref(input: {
	pathname: string
	search: URLSearchParams
	scopeId: string | null
}): string {
	const tab = fiscalWorkspaceTabFromPathname(input.pathname)
	const params = fiscalWorkspaceTabSearchParams({
		tab,
		active: tab,
		search: input.search,
	})
	if (input.scopeId) params.set("scope", input.scopeId)
	else params.delete("scope")
	const query = params.toString()
	return query ? `${input.pathname}?${query}` : input.pathname
}
