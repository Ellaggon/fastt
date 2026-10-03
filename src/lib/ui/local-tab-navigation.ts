/** Local tabs may vary navigation metadata, never the object being edited. */
export function sameLocalTabContext(current: URL, next: URL, navigationKeys: readonly string[]) {
	if (
		current.origin !== next.origin ||
		current.pathname.replace(/\/$/, "") !== next.pathname.replace(/\/$/, "")
	)
		return false
	const context = (url: URL) => {
		const query = new URLSearchParams(url.search)
		for (const key of navigationKeys) query.delete(key)
		query.sort()
		return query.toString()
	}
	return context(current) === context(next)
}

/** Preserve the destination's own tab while updating the other line's memory. */
export function rememberTabInDestination(target: URL, current: URL) {
	const line = current.searchParams.get("line")
	const tab = current.searchParams.get("tab")
	if (line !== "tour" && line !== "lodging") return target
	const destinationLine = target.searchParams.get("line")
	const destinationTab = target.searchParams.get("tab")
	if (tab)
		target.searchParams.set(
			`${line}Tab`,
			destinationLine === line && destinationTab ? destinationTab : tab
		)
	const otherLine = line === "tour" ? "lodging" : "tour"
	const otherMemory = `${otherLine}Tab`
	if (destinationLine === otherLine && destinationTab)
		target.searchParams.set(otherMemory, destinationTab)
	else if (current.searchParams.has(otherMemory))
		target.searchParams.set(otherMemory, current.searchParams.get(otherMemory)!)
	return target
}
