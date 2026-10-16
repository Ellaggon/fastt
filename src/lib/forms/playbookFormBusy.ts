const PLAYBOOK_CTA_SELECTOR = "a.fastt-playbook-cta, button.fastt-playbook-cta"

function playbookContinueStatusEl(trigger: HTMLElement | null): HTMLElement | null {
	const footer =
		trigger?.closest("footer.fastt-playbook-footer") ??
		document.querySelector("footer.fastt-playbook-footer")
	return (
		footer?.querySelector<HTMLElement>("[data-playbook-continue-status]") ??
		document.querySelector<HTMLElement>("[data-playbook-continue-status]")
	)
}

const busyControls = new Set<HTMLElement>()
const idleControls = new WeakMap<
	HTMLElement,
	{
		nodes: Node[]
		disabled: boolean
		ariaDisabled: string | null
		pointerBlocked: boolean
		dimmed: boolean
	}
>()
function decoratePlaybookCta(control: HTMLElement, busy: boolean, busyLabel?: string) {
	if (busy) {
		busyControls.add(control)
		if (!idleControls.has(control))
			idleControls.set(control, {
				nodes: Array.from(control.childNodes),
				disabled: control instanceof HTMLButtonElement && control.disabled,
				ariaDisabled: control.getAttribute("aria-disabled"),
				pointerBlocked: control.classList.contains("pointer-events-none"),
				dimmed: control.classList.contains("opacity-70"),
			})
		control.setAttribute("aria-busy", "true")
		if (control instanceof HTMLButtonElement) control.disabled = true
		if (control instanceof HTMLAnchorElement) {
			control.setAttribute("aria-disabled", "true")
			control.classList.add("pointer-events-none", "opacity-70")
		}
		if (busyLabel) {
			const spinner = document.createElement("span")
			spinner.dataset.playbookBusySpinner = "true"
			spinner.className =
				"inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
			spinner.setAttribute("aria-hidden", "true")
			control.replaceChildren(spinner, document.createTextNode(` ${busyLabel}`))
		}
		return
	}
	const idle = idleControls.get(control)
	if (!idle) return
	control.removeAttribute("aria-busy")
	if (control instanceof HTMLButtonElement) control.disabled = idle.disabled
	if (idle.ariaDisabled === null) control.removeAttribute("aria-disabled")
	else control.setAttribute("aria-disabled", idle.ariaDisabled)
	control.classList.toggle("pointer-events-none", idle.pointerBlocked)
	control.classList.toggle("opacity-70", idle.dimmed)
	control.replaceChildren(...idle.nodes)
	idleControls.delete(control)
	busyControls.delete(control)
}

export function setPlaybookFooterContinueBusy(
	trigger: HTMLElement,
	busy: boolean,
	busyLabel = "Guardando…"
) {
	const status = playbookContinueStatusEl(trigger)
	if (status) {
		if (busy && busyLabel) {
			status.hidden = false
			status.textContent = busyLabel
		} else {
			status.hidden = true
			status.textContent = ""
		}
	}
	const footer =
		trigger.closest("footer.fastt-playbook-footer") ??
		document.querySelector("footer.fastt-playbook-footer")
	const controls = footer?.querySelectorAll<HTMLElement>(PLAYBOOK_CTA_SELECTOR) ?? []
	for (const control of controls) {
		const label = busy && control === trigger ? busyLabel : busy ? undefined : undefined
		decoratePlaybookCta(control, busy, label)
	}
	if (busy && trigger && !Array.from(controls).includes(trigger)) {
		decoratePlaybookCta(trigger, true, busyLabel)
	} else if (!busy && trigger && !Array.from(controls).includes(trigger)) {
		decoratePlaybookCta(trigger, false)
	}
}

export function setPlaybookSubmitBusy(
	form: HTMLFormElement,
	busy: boolean,
	busyLabel = "Guardando…"
) {
	const formId = form.id.trim()
	const buttons = [
		...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
		...(formId
			? [...document.querySelectorAll<HTMLButtonElement>(`button[form="${CSS.escape(formId)}"]`)]
			: []),
	]
	let continueTrigger: HTMLButtonElement | null = null
	for (const button of buttons) {
		decoratePlaybookCta(button, busy, busy ? busyLabel : undefined)
		if (button.name === "playbookNav" && button.value === "continue") continueTrigger = button
	}

	const status = playbookContinueStatusEl(continueTrigger)
	if (status && busyLabel) {
		if (busy) {
			status.hidden = false
			status.textContent = busyLabel
		} else {
			status.hidden = true
			status.textContent = ""
		}
	}
}

const navigationTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
export function setPlaybookNavigationBusy(trigger: HTMLElement, onTimeout?: () => void) {
	setPlaybookFooterContinueBusy(trigger, true, "Cargando…")
	const previous = navigationTimers.get(trigger)
	if (previous) clearTimeout(previous)
	navigationTimers.set(
		trigger,
		setTimeout(() => {
			navigationTimers.delete(trigger)
			onTimeout?.()
			setPlaybookFooterContinueBusy(trigger, false)
			const status = playbookContinueStatusEl(trigger)
			if (status) {
				status.hidden = false
				status.textContent = "La página está tardando en abrirse. Puedes volver a intentarlo."
			}
		}, 15000)
	)
}
let navigationRecoveryBound = false
function bindNavigationRecovery() {
	if (navigationRecoveryBound) return
	navigationRecoveryBound = true
	const reset = () => {
		for (const [trigger, timer] of navigationTimers) {
			clearTimeout(timer)
			setPlaybookFooterContinueBusy(trigger, false)
		}
		navigationTimers.clear()
		for (const control of busyControls) decoratePlaybookCta(control, false)
		const status = playbookContinueStatusEl(null)
		if (status) {
			status.hidden = true
			status.textContent = ""
		}
		const marker = document.querySelector<HTMLElement>("[data-option-session]")
		if (marker) delete marker.dataset.navigating
	}
	window.addEventListener("pageshow", reset)
	document.addEventListener("astro:page-load", reset)
}

export function bindPlaybookFooterHrefContinue() {
	bindNavigationRecovery()
	for (const footer of document.querySelectorAll("footer.fastt-playbook-footer")) {
		if (!(footer instanceof HTMLElement) || footer.dataset.hrefContinueBound === "true") continue
		footer.dataset.hrefContinueBound = "true"
		footer.addEventListener(
			"click",
			(event) => {
				const link = (event.target as Element)?.closest<HTMLAnchorElement>("a.fastt-playbook-cta")
				if (
					!link ||
					event.defaultPrevented ||
					event.button !== 0 ||
					event.ctrlKey ||
					event.metaKey ||
					event.shiftKey ||
					event.altKey ||
					link.target === "_blank" ||
					link.hasAttribute("download")
				)
					return
				if (link.getAttribute("aria-busy") === "true") {
					event.preventDefault()
					return
				}
				const target = new URL(link.href, location.href)
				if (target.searchParams.get("playbook") === "add-tour-option") return
				// Let the guard and router inspect the original clicked node first.
				queueMicrotask(() => setPlaybookNavigationBusy(link))
			},
			{ capture: false }
		)
	}
}
