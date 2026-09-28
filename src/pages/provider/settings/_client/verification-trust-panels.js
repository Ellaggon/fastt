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

function resolveVerificationTrustPanelFromUrl(url) {
	const businessTab = url.searchParams.get("tab")
	if (["identity", "business", "activity", "safety", "fiscal", "payments"].includes(businessTab))
		return businessTab
	const pathname = normalizePath(url.pathname || window.location.pathname)
	if (pathname.endsWith("/verification/payments")) return "payments"
	if (pathname.endsWith("/verification/fiscal")) return "fiscal"
	if (!pathname.includes("/provider/settings/verification")) return "identity"
	if (url.searchParams.get("type") === "government_id") return "identity"
	if (url.searchParams.get("type")) return "business"
	if (url.hash === "#kyc-slots" || url.hash.startsWith("#kyc-slot-")) return "business"
	return "identity"
}

function resolveVerificationTrustPanel() {
	return resolveVerificationTrustPanelFromUrl(new URL(window.location.href))
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

function syncVerificationTrustPanels() {
	const activeId = resolveVerificationTrustPanel()
	syncVerificationPageDescription(activeId)
	syncVerificationTabNav(activeId)
	const hubActive = activeId === "identity" || activeId === "business"
	document.querySelectorAll("[data-verification-trust-panel]").forEach((panel) => {
		const isActive = panel.getAttribute("data-verification-trust-panel") === activeId
		panel.removeAttribute("hidden")
		panel.setAttribute("data-active", isActive ? "true" : "false")
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
		window.history.pushState({}, "", url.pathname + url.search + url.hash)
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
	const url = new URL(href, window.location.href)
	if (url.origin !== window.location.origin) return
	const currentUrl = new URL(window.location.href)
	if (currentUrl.searchParams.has("line")) {
		const businessNav = target.closest("[data-verification-business-nav]")
		if (businessNav) {
			if (target.closest("[data-verification-tab-link]")) {
				event.preventDefault()
				activateVerificationTrustUrl(url, {
					preserveScroll: true,
					scrollToPanel: Boolean(url.hash),
				})
				return
			}
			if (target.closest("[data-verification-line-link]")) return
			return
		}
		if (isVerificationWorkspacePath(url.pathname) && !url.searchParams.has("line")) {
			url.searchParams.set("line", currentUrl.searchParams.get("line"))
			const experience = currentUrl.searchParams.get("experience")
			if (experience) url.searchParams.set("experience", experience)
			const tab = url.pathname.endsWith("/fiscal")
				? "fiscal"
				: url.pathname.endsWith("/payments")
					? "payments"
					: url.searchParams.get("type") === "government_id"
						? "identity"
						: url.searchParams.get("type")
							? currentUrl.searchParams.get("line") === "tour"
								? "activity"
								: "business"
							: "identity"
			url.searchParams.set("tab", tab)
		}
		if (isVerificationWorkspacePath(url.pathname)) {
			event.preventDefault()
			if (normalizePath(url.pathname) === normalizePath(currentUrl.pathname)) {
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
	window.addEventListener("popstate", () => {
		preserveVerificationScrollPosition(() => {
			if (window.__fasttVerificationTrustSync) window.__fasttVerificationTrustSync()
		})
		window.dispatchEvent(new Event("provider-verification-trust-sync"))
	})
}

syncVerificationTrustPanels()
window.dispatchEvent(new Event("provider-verification-trust-sync"))
