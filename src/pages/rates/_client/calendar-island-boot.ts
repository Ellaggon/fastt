const CALENDAR_PATHS = new Set(["/rates/calendar", "/rates/multi-calendar"])

type AstroIslandElement = HTMLElement & {
	start?: () => void | Promise<void>
}

function normalizePath(pathname: string): string {
	return pathname.replace(/\/$/, "") || "/"
}

function isCalendarWorkspacePath(pathname: string): boolean {
	return CALENDAR_PATHS.has(normalizePath(pathname))
}

/** ClientRouter swaps can leave `client:only` islands without a hydration pass. */
export function bootCalendarIslands(root: ParentNode = document): void {
	if (!isCalendarWorkspacePath(window.location.pathname)) return
	root.querySelectorAll<AstroIslandElement>('astro-island[client="only"]').forEach((island) => {
		if (island.hasAttribute("client-render-time")) return
		if (typeof island.start !== "function") return
		void island.start()
	})
}

function scheduleCalendarIslandBoot(): void {
	if (!isCalendarWorkspacePath(window.location.pathname)) return
	requestAnimationFrame(() => {
		requestAnimationFrame(() => bootCalendarIslands())
	})
}

let listenersInstalled = false

export function installCalendarIslandBoot(): void {
	if (listenersInstalled) return
	listenersInstalled = true
	document.addEventListener("astro:page-load", scheduleCalendarIslandBoot)
	document.addEventListener("astro:after-swap", scheduleCalendarIslandBoot)
	scheduleCalendarIslandBoot()
}
