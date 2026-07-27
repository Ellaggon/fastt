function resolveVerificationTrustPanelFromUrl(url) {
	const pathname = url.pathname || window.location.pathname
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
	document.querySelectorAll("[data-verification-trust-panel]").forEach((panel) => {
		const isActive = panel.getAttribute("data-verification-trust-panel") === activeId
		panel.toggleAttribute("hidden", !isActive)
		panel.setAttribute("data-active", isActive ? "true" : "false")
	})
}

function activateVerificationTrustUrl(url) {
	window.history.pushState({}, "", url.pathname + url.search + url.hash)
	syncVerificationTrustPanels()
	window.dispatchEvent(new Event("provider-verification-trust-sync"))
	scrollVerificationPanelIntoView(url)
}

function handleVerificationTrustClick(event) {
	const target = event.target instanceof Element ? event.target.closest("[data-trust-link]") : null
	if (!target) return
	const href = target.getAttribute("href")
	if (!href) return
	const url = new URL(href, window.location.origin)
	const sameVerificationPage =
		url.origin === window.location.origin &&
		url.pathname === window.location.pathname &&
		url.pathname.includes("/provider/settings/verification")
	if (!sameVerificationPage) return
	event.preventDefault()
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
