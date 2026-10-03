import { sameLocalTabContext, rememberTabInDestination } from "@/lib/ui/local-tab-navigation"

const VERIFICATION_WORKSPACE_PATHS = new Set([
	"/provider/settings/verification",
	"/provider/settings/verification/fiscal",
	"/provider/settings/verification/payments",
])

const VERIFICATION_PANEL_TITLES = {
	identity: "Verificación y documentos",
	business: "Verificación y documentos",
	activity: "Verificación y documentos",
	safety: "Verificación y documentos",
	fiscal: "Verificación fiscal",
	payments: "Verificación de pagos",
}

function normalizePath(pathname) {
	return String(pathname || "").replace(/\/$/, "") || "/"
}

function isVerificationWorkspacePath(pathname) {
	return VERIFICATION_WORKSPACE_PATHS.has(normalizePath(pathname))
}

/** Translate only known old anchors. Query selection always remains authoritative. */
function canonicalLegacyVerificationUrl(url) {
	if (
		!isVerificationWorkspacePath(url.pathname) ||
		url.searchParams.has("tab") ||
		url.searchParams.has("type")
	)
		return null
	const target = new URL(url.href)
	const slot = /^#kyc-slot-(government_id|business_registration|tax_document)$/.exec(url.hash)
	if (slot) target.searchParams.set("type", slot[1])
	else if (url.hash === "#verification-status-panel") target.searchParams.set("tab", "identity")
	else if (url.hash === "#kyc-slots") {
		target.searchParams.set("tab", "business")
	} else return null
	return target
}

function resolveVerificationTrustPanel() {
	// Tabs are server-rendered. URL aliases must never activate an unrendered
	// or inapplicable panel after hydration or a history navigation.
	return (
		document
			.querySelector("[data-verification-workspace]")
			?.getAttribute("data-verification-active-tab") || "identity"
	)
}

function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function preserveVerificationScrollPosition(apply) {
	const scrollX = window.scrollX
	const scrollY = window.scrollY
	apply()
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			window.scrollTo(scrollX, scrollY)
		})
	})
}

/** Deep links inside a panel (upload slots), not trust-rail tab switches. */
function scrollVerificationPanelIntoView(url) {
	if (!url.hash) return
	window.requestAnimationFrame(() => {
		const target = document.querySelector(url.hash)
		if (target && typeof target.scrollIntoView === "function") {
			target.scrollIntoView({
				block: "start",
				behavior: prefersReducedMotion() ? "auto" : "smooth",
			})
		}
	})
}

function syncVerificationPageDescription(activeId) {
	const el = document.querySelector("[data-verification-page-description]")
	if (!el) return
	const raw = el.getAttribute("data-verification-page-guidance")
	if (!raw) return
	let next = null
	try {
		const map = JSON.parse(raw)
		next = map?.[activeId]
	} catch {
		return
	}
	if (typeof next !== "string" || !next.trim()) return

	const apply = () => {
		el.textContent = next
		el.style.opacity = "1"
	}

	if (prefersReducedMotion()) {
		apply()
		return
	}

	el.style.opacity = "0"
	window.setTimeout(apply, 160)
}

function syncVerificationTabNav(activeId) {
	document.querySelectorAll("[data-verification-tab-link]").forEach((link) => {
		const tab = link.getAttribute("data-verification-tab-link")
		const active = tab === activeId
		link.setAttribute("data-active", active ? "true" : "false")
		if (active) {
			link.setAttribute("aria-current", "page")
		} else {
			link.removeAttribute("aria-current")
		}
	})
}

function verificationPanel(tab) {
	if (!tab || !/^[a-z_]+$/.test(tab)) return null
	return document.querySelector(`[data-verification-trust-panel="${tab}"]`)
}

/** Same page and same experience: only the visible section changes. */
function sameVerificationWorkspace(current, next) {
	return sameLocalTabContext(current, next, ["tab", "tourTab", "lodgingTab", "result", "error"])
}

function selectVerificationTab(tab) {
	const workspace = document.querySelector("[data-verification-workspace]")
	if (!workspace || !verificationPanel(tab)) return false
	const permitted = (workspace.getAttribute("data-verification-rendered-tabs") || "").split(" ")
	if (!permitted.includes(tab)) return false
	workspace.setAttribute("data-verification-active-tab", tab)
	return true
}

function syncVerificationExperienceContext(activeId) {
	const scoped = activeId === "activity" || activeId === "safety"
	document
		.querySelectorAll("[data-verification-experience-context], [data-verification-evidence-return]")
		.forEach((el) => {
			el.toggleAttribute("hidden", !scoped)
		})
	const experienceCopy =
		activeId === "safety"
			? {
					prompt: "Elige el tour para revisar sus respaldos de seguridad.",
					action: "Revisar seguridad y permisos",
				}
			: {
					prompt: "Elige el tour para revisar sus datos de operación y licencias.",
					action: "Revisar actividad y licencias",
				}
	if (scoped) {
		document.querySelectorAll("[data-verification-experience-prompt]").forEach((el) => {
			el.textContent = experienceCopy.prompt
		})
		document.querySelectorAll("[data-verification-experience-action]").forEach((el) => {
			el.textContent = experienceCopy.action
		})
	}
	const line = new URL(window.location.href).searchParams.get("line")
	document.querySelectorAll("[data-verification-experience-context] a[href]").forEach((link) => {
		const href = link.getAttribute("href")
		if (!href || href.startsWith("#")) return
		const next = new URL(href, window.location.href)
		if (next.origin !== window.location.origin) return
		next.searchParams.set("tab", activeId)
		if (line === "tour" || line === "lodging") next.searchParams.set(`${line}Tab`, activeId)
		link.setAttribute("href", next.pathname + next.search + next.hash)
	})
	document
		.querySelectorAll(
			"[data-verification-experience-selector] input[name='tab'], [data-verification-experience-selector] input[name='tourTab']"
		)
		.forEach((input) => {
			input.value = activeId
		})
}

function syncVerificationNavigationContext() {
	const current = new URL(window.location.href)
	const workspace = document.querySelector("[data-verification-workspace]")
	workspace?.querySelectorAll("a[href], form[action]").forEach((element) => {
		const attribute = element.tagName === "FORM" ? "action" : "href"
		const value = element.getAttribute(attribute)
		if (!value || value.startsWith("#")) return
		const target = new URL(value, current)
		if (target.origin !== current.origin || !target.searchParams.has("line")) return
		rememberTabInDestination(target, current)
		element.setAttribute(attribute, target.pathname + target.search + target.hash)
	})
}

function syncVerificationTrustPanels() {
	const legacy = canonicalLegacyVerificationUrl(new URL(window.location.href))
	if (legacy) {
		window.location.assign(legacy.pathname + legacy.search + legacy.hash)
		return
	}
	const activeId = resolveVerificationTrustPanel()
	syncVerificationPageDescription(activeId)
	syncVerificationTabNav(activeId)
	syncVerificationExperienceContext(activeId)
	syncVerificationNavigationContext()
	const hubActive = activeId === "identity" || activeId === "business"
	document.querySelectorAll("[data-verification-trust-panel]").forEach((panel) => {
		const isActive = panel.getAttribute("data-verification-trust-panel") === activeId
		panel.removeAttribute("hidden")
		panel.setAttribute("data-active", isActive ? "true" : "false")
		panel.setAttribute("aria-hidden", isActive ? "false" : "true")
		if (isActive) {
			panel.removeAttribute("inert")
		} else {
			panel.setAttribute("inert", "")
		}
	})
	document.querySelectorAll("[data-verification-hub-chrome]").forEach((el) => {
		el.toggleAttribute("hidden", !hubActive)
	})
	document.querySelectorAll("[data-verification-optionals-entry]").forEach((el) => {
		el.toggleAttribute("hidden", activeId !== "business")
	})
	const title = VERIFICATION_PANEL_TITLES[activeId]
	if (title) document.title = title
}

function activateVerificationTrustUrl(url, options = {}) {
	const { preserveScroll = true, scrollToPanel = false } = options
	const run = () => {
		window.history.pushState(window.history.state, "", url.pathname + url.search + url.hash)
		syncVerificationTrustPanels()
		window.dispatchEvent(new Event("provider-verification-trust-sync"))
		if (scrollToPanel && url.hash) {
			scrollVerificationPanelIntoView(url)
		}
	}
	if (preserveScroll) {
		preserveVerificationScrollPosition(run)
		return
	}
	run()
	if (scrollToPanel && url.hash) {
		scrollVerificationPanelIntoView(url)
	}
}

function handleVerificationTrustClick(event) {
	if (event.defaultPrevented) return
	if (event.button !== 0) return
	if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
	if (!document.querySelector("[data-verification-workspace]")) return
	const target = event.target instanceof Element ? event.target.closest("a[href]") : null
	if (!target) return
	if (target.getAttribute("download") != null) return
	if (target.getAttribute("target") === "_blank") return
	const href = target.getAttribute("href")
	if (!href) return
	const sourceUrl = new URL(href, window.location.href)
	const url = canonicalLegacyVerificationUrl(sourceUrl) ?? sourceUrl
	if (url.origin !== window.location.origin) return
	const currentUrl = new URL(window.location.href)
	if (currentUrl.searchParams.has("line")) {
		const tabId = target.getAttribute("data-verification-tab-link")
		if (
			tabId &&
			!document.querySelector("[data-verification-workspace][data-loading]") &&
			sameVerificationWorkspace(currentUrl, url) &&
			selectVerificationTab(tabId)
		) {
			// The sections are already rendered. Switching them here avoids reloading the workspace.
			event.preventDefault()
			activateVerificationTrustUrl(url, { preserveScroll: true, scrollToPanel: false })
			return
		}
		// A different line or experience still needs the server-rendered workspace.
		if (target.closest("[data-verification-business-nav]")) return
		if (isVerificationWorkspacePath(url.pathname)) {
			event.preventDefault()
			if (url.pathname === currentUrl.pathname && url.search === currentUrl.search) {
				activateVerificationTrustUrl(url, {
					preserveScroll: true,
					scrollToPanel: Boolean(url.hash),
				})
				return
			}
			window.location.assign(url.pathname + url.search + url.hash)
		}
		return
	}
	if (!isVerificationWorkspacePath(url.pathname)) return
	// Older entries also need SSR when the path or query changes. Only anchors
	// within the already loaded workspace may switch locally.
	if (url.pathname !== currentUrl.pathname || url.search !== currentUrl.search) return
	const trustRail = target.closest("[data-trust-link]")
	event.preventDefault()
	const next = url.pathname + url.search + url.hash
	const current = window.location.pathname + window.location.search + window.location.hash
	if (next === current) {
		preserveVerificationScrollPosition(() => {
			syncVerificationTrustPanels()
		})
		if (!trustRail && url.hash) {
			scrollVerificationPanelIntoView(url)
		}
		return
	}
	activateVerificationTrustUrl(url, {
		preserveScroll: Boolean(trustRail),
		scrollToPanel: !trustRail && Boolean(url.hash),
	})
}

window.__fasttVerificationTrustSync = syncVerificationTrustPanels

if (!window.__fasttVerificationTrustBound) {
	window.__fasttVerificationTrustBound = true
	document.addEventListener("astro:before-preparation", (event) => {
		const workspace = document.querySelector("[data-verification-workspace]")
		const loading = workspace?.querySelector("[data-verification-loading]")
		if (!loading || !isVerificationWorkspacePath(event.to.pathname)) return
		workspace.setAttribute("data-loading", "")
		loading.hidden = false
		const slow = workspace.querySelector("[data-verification-loading-slow]")
		const timer = window.setTimeout(() => {
			if (slow) slow.hidden = false
		}, 12000)
		const reset = () => {
			window.clearTimeout(timer)
			workspace.removeAttribute("data-loading")
			loading.hidden = true
			if (slow) slow.hidden = true
		}
		event.signal.addEventListener("abort", reset, { once: true })
		const load = event.loader
		event.loader = async () => {
			try {
				await load()
			} catch (error) {
				reset()
				throw error
			} finally {
				window.clearTimeout(timer)
			}
		}
	})
	document.addEventListener("click", handleVerificationTrustClick, true)
	document.addEventListener("astro:page-load", () => {
		if (window.__fasttVerificationTrustSync) window.__fasttVerificationTrustSync()
	})
	window.addEventListener("hashchange", () => {
		if (window.__fasttVerificationTrustSync) {
			preserveVerificationScrollPosition(() => {
				window.__fasttVerificationTrustSync()
			})
		}
	})
	document.addEventListener(
		"fastt:before-history-navigation",
		(event) => {
			const current = new URL(window.location.href)
			const workspace = document.querySelector("[data-verification-workspace]")
			const initial = workspace?.getAttribute("data-verification-initial-url")
			const tab = current.searchParams.get("tab") || "identity"
			if (
				!initial ||
				!sameVerificationWorkspace(new URL(initial, current), current) ||
				!selectVerificationTab(tab)
			) {
				return
			}
			// Handle this local entry before Astro's router reloads the same workspace.
			// A different object still goes through the server branch above.
			event.preventDefault()
			preserveVerificationScrollPosition(() => {
				if (window.__fasttVerificationTrustSync) window.__fasttVerificationTrustSync()
			})
			window.dispatchEvent(new Event("provider-verification-trust-sync"))
		},
		true
	)
}

syncVerificationTrustPanels()
window.dispatchEvent(new Event("provider-verification-trust-sync"))
