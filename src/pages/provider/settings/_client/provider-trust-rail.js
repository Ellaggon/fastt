function resolveTrustRailActiveId() {
	const pathname = window.location.pathname
	if (pathname.includes("/provider/settings/verification/fiscal")) return "fiscal"
	if (pathname.includes("/provider/settings/verification/payments")) return "payments"
	if (pathname.includes("/provider/settings/tax-fees/identity")) return "fiscal"
	if (pathname.includes("/provider/settings/payments")) return "payments"
	if (pathname.includes("/provider/settings/verification/documents")) return "identity"
	if (
		pathname.includes("/provider/settings/verification") &&
		(new URLSearchParams(window.location.search).get("type") ||
			window.location.hash === "#kyc-slots" ||
			window.location.hash.startsWith("#kyc-slot-"))
	) {
		return "business"
	}
	return "identity"
}

function syncTrustRailActiveTab() {
	const activeId = resolveTrustRailActiveId()
	document.querySelectorAll("[data-trust-map-rail]").forEach((rail) => {
		rail.querySelectorAll("[data-trust-link]").forEach((link) => {
			const active = link.getAttribute("data-trust-link") === activeId
			link.setAttribute("data-active", active ? "true" : "false")
			if (active) {
				link.setAttribute("data-trust-link-active", "true")
				link.setAttribute("aria-current", "page")
			} else {
				link.removeAttribute("data-trust-link-active")
				link.removeAttribute("aria-current")
			}
		})
	})
}

function requestTrustRailSync() {
	window.requestAnimationFrame(syncTrustRailActiveTab)
}

if (!window.__fasttTrustRailBound) {
	window.__fasttTrustRailBound = true
	window.addEventListener("hashchange", requestTrustRailSync)
	window.addEventListener("popstate", requestTrustRailSync)
	window.addEventListener("provider-verification-trust-sync", requestTrustRailSync)
	document.addEventListener("astro:page-load", requestTrustRailSync)
	document.addEventListener(
		"click",
		(event) => {
			const target =
				event.target instanceof Element ? event.target.closest("[data-trust-link]") : null
			if (!target) return
			requestTrustRailSync()
		},
		true
	)
}

syncTrustRailActiveTab()
