const VERIFICATION_WORKSPACE_PATHS = new Set([
	"/provider/settings/verification",
	"/provider/settings/verification/fiscal",
	"/provider/settings/verification/payments",
])

const VERIFICATION_PANEL_TITLES = {
	identity: "Verificación y documentos",
	business: "Verificación y documentos",
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
	const pathname = normalizePath(url.pathname || window.location.pathname)
	if (pathname.endsWith("/verification/payments")) return "payments"
	if (pathname.endsWith("/verification/fiscal")) return "fiscal"
	if (!pathname.includes("/provider/settings/verification")) return "identity"
	if (url.searchParams.get("type")) return "business"
	if (url.hash === "#kyc-slots" || url.hash.startsWith("#kyc-slot-")) return "business"
	return "identity"
}

function resolveVerificationTrustPanel() {
	return resolveVerificationTrustPanelFromUrl(new URL(window.location.href))
}

function scrollVerificationPanelIntoView(url) {
	if (!url.hash) return
	window.requestAnimationFrame(() => {
		const target = document.querySelector(url.hash)
		if (target && typeof target.scrollIntoView === "function") {
			target.scrollIntoView({ block: "start" })
		}
	})
}

function syncVerificationTrustPanels() {
	const activeId = resolveVerificationTrustPanel()
	const hubActive = activeId === "identity" || activeId === "business"
	document.querySelectorAll("[data-verification-trust-panel]").forEach((panel) => {
		const isActive = panel.getAttribute("data-verification-trust-panel") === activeId
		panel.toggleAttribute("hidden", !isActive)
		panel.setAttribute("data-active", isActive ? "true" : "false")
	})
	document.querySelectorAll("[data-verification-hub-chrome]").forEach((el) => {
		el.toggleAttribute("hidden", !hubActive)
	})
	const title = VERIFICATION_PANEL_TITLES[activeId]
	if (title) document.title = title
}

function activateVerificationTrustUrl(url) {
	window.history.pushState({}, "", url.pathname + url.search + url.hash)
	syncVerificationTrustPanels()
	window.dispatchEvent(new Event("provider-verification-trust-sync"))
	if (url.hash) {
		scrollVerificationPanelIntoView(url)
	} else {
		window.scrollTo({ top: 0, behavior: "instant" })
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
	if (!isVerificationWorkspacePath(url.pathname)) return
	event.preventDefault()
	const next = url.pathname + url.search + url.hash
	const current = window.location.pathname + window.location.search + window.location.hash
	if (next === current) {
		syncVerificationTrustPanels()
		scrollVerificationPanelIntoView(url)
		return
	}
	activateVerificationTrustUrl(url)
}

window.__fasttVerificationTrustSync = syncVerificationTrustPanels

if (!window.__fasttVerificationTrustBound) {
	window.__fasttVerificationTrustBound = true
	document.addEventListener("click", handleVerificationTrustClick, true)
	document.addEventListener("astro:page-load", () => {
		if (window.__fasttVerificationTrustSync) window.__fasttVerificationTrustSync()
	})
	window.addEventListener("hashchange", () => {
		if (window.__fasttVerificationTrustSync) window.__fasttVerificationTrustSync()
	})
	window.addEventListener("popstate", () => {
		if (window.__fasttVerificationTrustSync) window.__fasttVerificationTrustSync()
		window.dispatchEvent(new Event("provider-verification-trust-sync"))
	})
}

syncVerificationTrustPanels()
window.dispatchEvent(new Event("provider-verification-trust-sync"))
