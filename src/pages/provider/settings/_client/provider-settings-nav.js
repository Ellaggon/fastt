const SETTINGS_TAB_PATHS = new Set([
	"/provider/settings",
	"/provider/settings/profile",
	"/provider/settings/team",
])

/** @type {Map<string, Promise<{ title: string; header: string; panel: string }>>} */
const tabPayloadCache = new Map()

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

function waitMs(ms) {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function preserveSettingsScrollPosition(scrollX, scrollY) {
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			window.scrollTo(scrollX, scrollY)
		})
	})
}

const SETTINGS_HEADER_LEAVE_MS = 280
const SETTINGS_PANEL_LEAVE_MS = 320
const SETTINGS_ENTER_MS = 420

async function fetchTabPayload(pathname) {
	const path = normalizePath(pathname)
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
	const path = normalizePath(pathname)
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

function syncSettingsSubnavActive() {
	const path = normalizePath(window.location.pathname)
	document.querySelectorAll("a[data-provider-settings-nav]").forEach((node) => {
		if (!(node instanceof HTMLAnchorElement)) return
		const hrefPath = normalizePath(new URL(node.href, window.location.href).pathname)
		const active = hrefPath === path
		node.toggleAttribute("aria-current", active)
		node.dataset.active = active ? "true" : "false"
	})
}

async function applyTabPayload(payload, destination) {
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

	if (motion) {
		header.setAttribute("data-settings-header-leaving", "true")
		panel.setAttribute("data-settings-panel-leaving", "true")
		await waitMs(Math.max(SETTINGS_HEADER_LEAVE_MS, SETTINGS_PANEL_LEAVE_MS))
	}

	header.replaceWith(nextHeader)
	panel.replaceWith(nextPanel)

	const rootAfter = settingsShellRoot()
	const newHeader = rootAfter ? shellHeader(rootAfter) : null
	const newPanel = rootAfter?.querySelector("[data-provider-settings-panel]") ?? null

	if (motion && newHeader && newPanel) {
		newHeader.setAttribute("data-settings-header-entering", "true")
		newPanel.setAttribute("data-settings-panel-entering", "true")
		await waitMs(16)
		newHeader.removeAttribute("data-settings-header-entering")
		newPanel.removeAttribute("data-settings-panel-entering")
		await waitMs(SETTINGS_ENTER_MS)
	}

	document.title = payload.title
	window.history.pushState({ providerSettingsTab: destination }, "", destination)
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
	if (normalizePath(url.pathname) === normalizePath(window.location.pathname)) return

	showSettingsPending()
	try {
		let payload
		try {
			payload = await loadTabPayload(url.pathname)
		} catch {
			payload = await loadTabPayload(url.pathname, { force: true })
		}
		if (!(await applyTabPayload(payload, destination))) throw new Error("settings_tab_apply_failed")
	} catch {
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
		import("astro:transitions/client").then(({ prefetch }) => prefetch(path)).catch(() => {})
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
		if (!isSettingsHubTabPath(window.location.pathname)) return
		const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
		showSettingsPending()
		loadTabPayload(window.location.pathname, { force: true })
			.then(async (payload) => {
				if (!(await applyTabPayload(payload, destination))) throw new Error("popstate_apply_failed")
			})
			.catch(() => {
				window.location.reload()
			})
	})
}

function drainSettingsNavQueue() {
	const queued = window.__fasttSettingsNavQueue
	if (!queued) return
	delete window.__fasttSettingsNavQueue
	void navigateSettingsTab(queued)
}

export function bootProviderSettingsNav() {
	if (!isSettingsHubTabPath(window.location.pathname)) return
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

document.addEventListener("astro:page-load", bootProviderSettingsNav)
bootProviderSettingsNav()
drainSettingsNavQueue()
