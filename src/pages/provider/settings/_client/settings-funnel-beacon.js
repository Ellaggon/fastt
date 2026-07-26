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

/** P2: measure time-to-upload for KYC capture (owner form path). */
function bindKycCaptureTiming(form) {
	if (!(form instanceof HTMLFormElement)) return
	if (form.getAttribute("data-kyc-timing-bound") === "true") return
	form.setAttribute("data-kyc-timing-bound", "true")

	const startedAt = performance.now()
	let fileSelectedAt = null
	const docType = readAttr(form, "data-kyc-upload-type") || "unknown"
	const surface = readAttr(form, "data-funnel-surface") || "verification"
	const domain = readAttr(form, "data-funnel-domain") || "documents"

	const fileInput = form.querySelector("[data-kyc-file-input]")
	if (fileInput) {
		fileInput.addEventListener("change", () => {
			if (!fileInput.files?.length) return
			fileSelectedAt = performance.now()
			sendFunnelEvent({
				event: "provider.settings.funnel.kyc_capture_timing",
				domain,
				surface,
				blockerId: "open_to_file",
				ctaTarget: `doc=${docType};ms=${Math.round(fileSelectedAt - startedAt)}`,
			})
		})
	}

	form.addEventListener("submit", () => {
		const now = performance.now()
		const openToSubmitMs = Math.round(now - startedAt)
		const fileToSubmitMs = fileSelectedAt != null ? Math.round(now - fileSelectedAt) : null
		sendFunnelEvent({
			event: "provider.settings.funnel.kyc_capture_timing",
			domain,
			surface,
			blockerId: "open_to_submit",
			ctaTarget:
				`doc=${docType};ms=${openToSubmitMs}` +
				(fileToSubmitMs != null ? `;file_to_submit_ms=${fileToSubmitMs}` : ""),
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

	document
		.querySelectorAll("[data-kyc-inline-upload-form][data-kyc-capture-timing]")
		.forEach(bindKycCaptureTiming)
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", bindAll)
} else {
	bindAll()
}

document.addEventListener("settings-summary-hydrated", () => {
	bindAll()
})
