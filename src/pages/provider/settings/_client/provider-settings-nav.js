const SETTINGS_TAB_PATHS = new Set([
	"/provider/settings",
	"/provider/settings/profile",
	"/provider/settings/team",
])

/** @type {Map<string, Promise<{ title: string; header: string; panel: string }>>} */
const tabPayloadCache = new Map()
let navigationRevision = 0

function normalizePath(pathname) {
	return String(pathname ?? "").replace(/\/$/, "") || "/"
}

export function isSettingsHubTabPath(pathname) {
	return SETTINGS_TAB_PATHS.has(normalizePath(pathname))
}

function settingsTabUrl(href) {
	try {
		const url = new URL(href, window.location.href)
		if (url.origin !== window.location.origin) return null
		if (!isSettingsHubTabPath(url.pathname)) return null
		return url
	} catch {
		return null
	}
}

function settingsShellRoot() {
	return document.querySelector("[data-provider-settings-shell]")
}

function shellHeader(root) {
	for (const child of root.children) {
		if (child instanceof HTMLElement && child.tagName === "HEADER") return child
	}
	return null
}

function extractTabPayload(doc) {
	const root = doc.querySelector("[data-provider-settings-shell]")
	if (!root) return null
	const header = shellHeader(root)
	const panel = root.querySelector("[data-provider-settings-panel]")
	if (!header || !panel) return null
	return {
		title: doc.title,
		header: header.outerHTML,
		panel: panel.outerHTML,
	}
}

function htmlToElement(html) {
	const template = document.createElement("template")
	template.innerHTML = html.trim()
	return template.content.firstElementChild
}

function hideWorkspacePending() {
	const pending = document.querySelector("[data-workspace-navigation-pending]")
	if (!pending) return
	pending.hidden = true
	pending.setAttribute("aria-hidden", "true")
}

let panelPendingTimer = 0

function setPanelLoading(loading) {
	const panel = document.querySelector("[data-provider-settings-panel]")
	if (!panel) return
	panel.toggleAttribute("data-settings-panel-loading", loading)
}

function showSettingsPending() {
	window.clearTimeout(panelPendingTimer)
	panelPendingTimer = window.setTimeout(() => setPanelLoading(true), 180)
}

function hideSettingsPending() {
	window.clearTimeout(panelPendingTimer)
	panelPendingTimer = 0
	setPanelLoading(false)
	hideWorkspacePending()
}

function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function preserveSettingsScrollPosition(scrollX, scrollY) {
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			window.scrollTo(scrollX, scrollY)
		})
	})
}

export function settingsTabCacheKey(href) {
	const url = settingsTabUrl(href)
	return url ? `${normalizePath(url.pathname)}${url.search}` : null
}

async function fetchTabPayload(path) {
	const response = await fetch(path, {
		credentials: "same-origin",
		headers: { Accept: "text/html" },
	})
	if (!response.ok) throw new Error(`settings_tab_${response.status}`)
	const html = await response.text()
	const doc = new DOMParser().parseFromString(html, "text/html")
	const payload = extractTabPayload(doc)
	if (!payload) throw new Error("settings_tab_missing_shell")
	return payload
}

function loadTabPayload(pathname, { force = false } = {}) {
	const path = settingsTabCacheKey(pathname)
	if (!path) return Promise.reject(new Error("settings_tab_invalid_path"))
	if (!force) {
		const existing = tabPayloadCache.get(path)
		if (existing) return existing
	}
	const pending = fetchTabPayload(path)
		.then((payload) => {
			tabPayloadCache.set(path, Promise.resolve(payload))
			return payload
		})
		.catch((error) => {
			tabPayloadCache.delete(path)
			throw error
		})
	tabPayloadCache.set(path, pending)
	return pending
}

export function syncSettingsSubnavActive() {
	const path = normalizePath(window.location.pathname)
	document.querySelectorAll("a[data-provider-settings-tab]").forEach((node) => {
		if (!(node instanceof HTMLAnchorElement)) return
		const hrefPath = normalizePath(new URL(node.href, window.location.href).pathname)
		const active = hrefPath === path
		if (active) node.setAttribute("aria-current", "page")
		else node.removeAttribute("aria-current")
		node.dataset.active = active ? "true" : "false"
	})
}

async function applyTabPayload(payload, destination, { pushHistory = true } = {}) {
	const root = settingsShellRoot()
	if (!root) return false
	const header = shellHeader(root)
	const panel = root.querySelector("[data-provider-settings-panel]")
	if (!header || !panel) return false

	const nextHeader = htmlToElement(payload.header)
	const nextPanel = htmlToElement(payload.panel)
	if (!nextHeader || !nextPanel) return false

	const scrollX = window.scrollX
	const scrollY = window.scrollY
	const motion = !prefersReducedMotion()

	header.replaceWith(nextHeader)
	panel.replaceWith(nextPanel)

	const rootAfter = settingsShellRoot()
	const newHeader = rootAfter ? shellHeader(rootAfter) : null
	const newPanel = rootAfter?.querySelector("[data-provider-settings-panel]") ?? null

	if (motion && newHeader && newPanel) {
		newPanel.setAttribute("data-settings-panel-entering", "true")
		newPanel.addEventListener(
			"animationend",
			() => newPanel.removeAttribute("data-settings-panel-entering"),
			{ once: true }
		)
	}

	document.title = payload.title
	if (pushHistory) window.history.pushState({ providerSettingsTab: destination }, "", destination)
	syncSettingsSubnavActive()
	hideSettingsPending()
	preserveSettingsScrollPosition(scrollX, scrollY)
	document.dispatchEvent(new Event("provider-settings-tab-applied"))
	return true
}

async function navigateSettingsTab(href) {
	const url = settingsTabUrl(href)
	if (!url) return
	const destination = `${url.pathname}${url.search}${url.hash}`
	if (destination === `${window.location.pathname}${window.location.search}${window.location.hash}`)
		return
	const revision = ++navigationRevision

	showSettingsPending()
	try {
		let payload
		try {
			payload = await loadTabPayload(url.pathname + url.search)
		} catch {
			payload = await loadTabPayload(url.pathname + url.search, { force: true })
		}
		if (revision !== navigationRevision) return
		if (!(await applyTabPayload(payload, destination))) throw new Error("settings_tab_apply_failed")
	} catch {
		if (revision !== navigationRevision) return
		hideSettingsPending()
		try {
			const { navigate } = await import("astro:transitions/client")
			await navigate(destination)
		} catch {
			window.location.assign(destination)
		}
	}
}

function warmSettingsTabCache() {
	for (const path of SETTINGS_TAB_PATHS) {
		if (normalizePath(path) === normalizePath(window.location.pathname)) continue
		loadTabPayload(path).catch(() => {})
	}
}

function bindSettingsNav() {
	if (document.documentElement.dataset.providerSettingsNavReady === "true") return
	document.documentElement.dataset.providerSettingsNavReady = "true"

	document.addEventListener(
		"click",
		(event) => {
			if (event.defaultPrevented) return
			if (event.button !== 0) return
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
			const target = event.target
			if (!(target instanceof Element)) return
			const link = target.closest("a[data-provider-settings-nav]")
			if (!(link instanceof HTMLAnchorElement)) return
			if (link.getAttribute("aria-current") === "page") return
			const url = settingsTabUrl(link.href)
			if (!url) return
			if (normalizePath(url.pathname) === normalizePath(window.location.pathname)) return
			event.preventDefault()
			event.stopPropagation()
			void navigateSettingsTab(link.href)
		},
		true
	)

	document.addEventListener(
		"click",
		async (event) => {
			const target = event.target
			if (!(target instanceof Element)) return
			const button = target.closest("[data-copy-invite-link]")
			if (!(button instanceof HTMLButtonElement)) return
			const urlInput = button.parentElement?.querySelector("[data-invite-accept-url]")
			if (!(urlInput instanceof HTMLInputElement)) return
			try {
				await navigator.clipboard?.writeText(urlInput.value)
				button.textContent = "Copiado"
				window.setTimeout(() => {
					button.textContent = "Copiar"
				}, 1600)
			} catch {
				/* ignore clipboard failures */
			}
		},
		true
	)

	window.addEventListener("popstate", () => {
		if (
			!isSettingsHubTabPath(window.location.pathname) ||
			!window.history.state?.providerSettingsTab
		)
			return
		const revision = ++navigationRevision
		const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
		showSettingsPending()
		loadTabPayload(window.location.pathname + window.location.search, { force: true })
			.then(async (payload) => {
				if (revision !== navigationRevision) return
				if (!(await applyTabPayload(payload, destination, { pushHistory: false })))
					throw new Error("popstate_apply_failed")
			})
			.catch(() => {
				if (revision !== navigationRevision) return
				window.location.reload()
			})
	})
	document.addEventListener("fastt:before-history-navigation", (event) => {
		if (isSettingsHubTabPath(window.location.pathname) && window.history.state?.providerSettingsTab)
			event.preventDefault()
	})
}

function drainSettingsNavQueue() {
	const queued = window.__fasttSettingsNavQueue
	if (!queued) return
	delete window.__fasttSettingsNavQueue
	void navigateSettingsTab(queued)
}

export function bootProviderSettingsNav() {
	if (
		!isSettingsHubTabPath(window.location.pathname) &&
		normalizePath(window.location.pathname) !== "/provider/settings/payments"
	)
		return
	window.__fasttNavigateSettingsTab = (href) => {
		void navigateSettingsTab(href)
	}
	bindSettingsNav()
	syncSettingsSubnavActive()
	drainSettingsNavQueue()
	const idle = window.requestIdleCallback ?? ((cb) => window.setTimeout(cb, 300))
	idle(() => warmSettingsTabCache())
}

window.__fasttNavigateSettingsTab = (href) => {
	void navigateSettingsTab(href)
}

document.addEventListener("astro:before-preparation", () => {
	navigationRevision++
})
document.addEventListener("astro:page-load", () => {
	navigationRevision++
	tabPayloadCache.clear()
	bootProviderSettingsNav()
})
bootProviderSettingsNav()
drainSettingsNavQueue()
