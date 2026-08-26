const ROOT_SELECTOR = "[data-bottom-toast]"
const DISMISS_SELECTOR = "[data-bottom-toast-dismiss]"
const DEFAULT_AUTO_DISMISS_MS = 6_000
const DISMISS_ANIMATION_MS = 180

const dismissTimers = new WeakMap<HTMLElement, number>()

let controllerInstalled = false

function clearQueryParam(param: string) {
	const url = new URL(window.location.href)
	if (!url.searchParams.has(param)) return
	url.searchParams.delete(param)
	window.history.replaceState(window.history.state, "", url)
}

function dismissToast(toast: HTMLElement) {
	if (toast.dataset.dismissed === "true") return
	toast.dataset.dismissed = "true"

	const timer = dismissTimers.get(toast)
	if (timer != null) window.clearTimeout(timer)

	window.setTimeout(() => {
		const clearParam = toast.dataset.bottomToastClearParam?.trim()
		if (clearParam) clearQueryParam(clearParam)
		toast.remove()
	}, DISMISS_ANIMATION_MS)
}

function setupBottomToast(toast: HTMLElement) {
	if (toast.dataset.bottomToastReady === "true") return
	toast.dataset.bottomToastReady = "true"

	const dismissButton = toast.querySelector<HTMLButtonElement>(DISMISS_SELECTOR)
	dismissButton?.addEventListener("click", () => dismissToast(toast))

	const autoDismissMs = Number(toast.dataset.bottomToastAutoDismiss ?? DEFAULT_AUTO_DISMISS_MS)
	if (Number.isFinite(autoDismissMs) && autoDismissMs > 0) {
		dismissTimers.set(
			toast,
			window.setTimeout(() => dismissToast(toast), autoDismissMs)
		)
	}
}

export function initBottomToasts(root: ParentNode = document) {
	for (const toast of root.querySelectorAll<HTMLElement>(ROOT_SELECTOR)) {
		setupBottomToast(toast)
	}
}

export function installBottomToastController() {
	initBottomToasts()
	if (controllerInstalled) return
	controllerInstalled = true
	document.addEventListener("astro:page-load", () => initBottomToasts())
}
