import { setPlaybookFooterContinueBusy, setPlaybookNavigationBusy } from "./playbookFormBusy"
declare global {
	interface Window {
		fasttOptionDestination: (href: string) => Promise<string>
	}
}
/** Commercial fields have already persisted; navigation failure must retain their identity. */
export async function persistOptionDestination(href: string) {
	const source = new URL(window.location.href)
	if (source.searchParams.get("playbook") !== "add-tour-option") return href
	const target = new URL(href, source)
	const sessionId = source.searchParams.get("sessionId") || ""
	if (target.searchParams.get("playbook") !== "add-tour-option") return href
	const marker = document.querySelector<HTMLElement>("[data-option-session]")
	if (!marker) throw new Error("Los datos están guardados. Recarga para recuperar el recorrido.")
	const response = await fetch("/api/onboarding/tour-option-session", {
		method: "POST",
		signal: AbortSignal.timeout(15000),
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			sessionId,
			lastPath: target.pathname + target.search,
			revision: Number(marker.dataset.revision),
		}),
	})
	const body = await response.json().catch(() => ({}))
	if (!response.ok)
		throw new Error(
			body.message || "Los datos están guardados; no pudimos guardar la continuación. Reintenta."
		)
	marker.dataset.revision = String(body.revision)
	return body.href as string
}

/** Shared by routed links and imperative calendar buttons. */
export async function navigateOptionDestination(href: string, trigger: HTMLElement) {
	const marker = document.querySelector<HTMLElement>("[data-option-session]")
	if (marker?.dataset.navigating === "true") return
	if (marker) marker.dataset.navigating = "true"
	setPlaybookFooterContinueBusy(trigger, true, "Guardando continuación…")
	try {
		const destination = await persistOptionDestination(href)
		setPlaybookNavigationBusy(trigger, () => {
			if (marker) delete marker.dataset.navigating
		})
		location.assign(destination)
	} catch (error) {
		if (marker) delete marker.dataset.navigating
		setPlaybookFooterContinueBusy(trigger, false)
		throw error
	}
}

/** Bind before document-level routing, but after the capture-phase unsaved guard. */
export function bindOptionNavigation() {
	const marker = document.querySelector<HTMLElement>("[data-option-session]")
	const root = marker?.closest("main")
	if (!marker || !root || marker.dataset.bound) return
	marker.dataset.bound = "true"
	const controller = new AbortController()
	root.addEventListener(
		"click",
		async (event) => {
			const click = event as MouseEvent
			const link =
				click.target instanceof Element ? click.target.closest<HTMLAnchorElement>("a[href]") : null
			if (
				!link ||
				click.defaultPrevented ||
				click.button !== 0 ||
				click.ctrlKey ||
				click.metaKey ||
				click.shiftKey ||
				click.altKey ||
				link.target === "_blank" ||
				link.hasAttribute("download")
			)
				return
			const target = new URL(link.href, location.href)
			if (
				target.origin !== location.origin ||
				target.searchParams.get("playbook") !== "add-tour-option" ||
				target.searchParams.get("sessionId") !== marker.dataset.sessionId
			)
				return
			click.preventDefault()
			const feedback = marker.querySelector<HTMLElement>("[data-option-navigation-error]")
			if (feedback) feedback.hidden = true
			try {
				await navigateOptionDestination(target.pathname + target.search, link)
			} catch (error) {
				if (feedback) {
					feedback.hidden = false
					feedback.textContent =
						error instanceof Error
							? error.message
							: "No pudimos guardar la continuación. Vuelve a intentarlo."
				}
			}
		},
		{ signal: controller.signal }
	)
	document.addEventListener("astro:before-swap", () => controller.abort(), { once: true })
}
