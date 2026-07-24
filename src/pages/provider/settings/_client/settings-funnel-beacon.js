const ENDPOINT = "/api/provider/settings/funnel"

function sendFunnelEvent(payload) {
	try {
		const body = JSON.stringify(payload)
		if (navigator.sendBeacon) {
			navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))
			return
		}
		fetch(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
			keepalive: true,
			credentials: "same-origin",
		}).catch(() => {})
	} catch {
		/* ignore beacon failures */
	}
}

function readAttr(el, name) {
	return el?.getAttribute?.(name)?.trim() || null
}

function emitBlockerShown(root) {
	if (!root || root.getAttribute("data-funnel-emitted") === "true") return
	const blockerId = readAttr(root, "data-funnel-blocker-id")
	if (!blockerId) return
	root.setAttribute("data-funnel-emitted", "true")
	sendFunnelEvent({
		event: "provider.settings.funnel.blocker_shown",
		blockerId,
		domain: readAttr(root, "data-funnel-domain") || blockerId,
		surface: readAttr(root, "data-funnel-surface") || "hub_coach",
	})
}

function bindCta(el) {
	if (!(el instanceof HTMLElement) || el.getAttribute("data-funnel-bound") === "true") return
	el.setAttribute("data-funnel-bound", "true")
	el.addEventListener("click", () => {
		const kind =
			readAttr(el, "data-funnel-cta") ||
			(el.hasAttribute("data-settings-primary-cta")
				? "primary"
				: el.hasAttribute("data-settings-secondary-cta")
					? "secondary"
					: "post_save")
		const surface =
			readAttr(el, "data-funnel-surface") ||
			readAttr(el.closest("[data-funnel-surface]"), "data-funnel-surface") ||
			(el.closest("[data-settings-coach]") ? "hub_coach" : "unknown")
		const coach = el.closest("[data-settings-next-step]")
		sendFunnelEvent({
			event: "provider.settings.funnel.cta_clicked",
			ctaKind: kind,
			ctaTarget: el.getAttribute("href") || window.location.pathname,
			domain:
				readAttr(el, "data-funnel-domain") ||
				readAttr(coach, "data-funnel-domain") ||
				readAttr(el.closest("[data-post-save-cta]"), "data-funnel-domain"),
			blockerId:
				readAttr(el, "data-funnel-blocker-id") || readAttr(coach, "data-funnel-blocker-id"),
			surface,
		})
	})
}

function bindAll() {
	const nextStep = document.querySelector("[data-settings-next-step]")
	if (nextStep) emitBlockerShown(nextStep)

	document
		.querySelectorAll(
			"[data-settings-primary-cta], [data-settings-secondary-cta], [data-post-save-cta] a, [data-funnel-cta]"
		)
		.forEach(bindCta)
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", bindAll)
} else {
	bindAll()
}

document.addEventListener("settings-summary-hydrated", () => {
	bindAll()
})
