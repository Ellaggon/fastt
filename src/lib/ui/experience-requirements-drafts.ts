import { formDraftFingerprint } from "@/lib/ui/form-draft-fingerprint"

function bindExperienceDrafts() {
	const root = document.querySelector<HTMLElement>("[data-experience-requirements]")
	if (!root || root.dataset.draftsReady) return
	root.dataset.draftsReady = "true"
	const controller = new AbortController()
	const { signal } = controller
	root.addEventListener("fastt:dispose", () => controller.abort(), { once: true, signal })
	document.addEventListener("astro:before-swap", () => controller.abort(), { once: true, signal })
	const forms = Array.from(root.querySelectorAll<HTMLFormElement>("form"))
	const initial = new Map(forms.map((form) => [form, formDraftFingerprint(new FormData(form))]))
	let leaving = false
	const dirty = () =>
		forms.some((form) =>
			form.matches("[data-tour-operating-context-form]")
				? form.dataset.dirty === "true"
				: formDraftFingerprint(new FormData(form)) !== initial.get(form)
		)
	root.addEventListener("submit", (event) => {
		const form = event.target
		if (form instanceof HTMLFormElement && !form.matches("[data-tour-operating-context-form]"))
			leaving = true
	})
	document.addEventListener(
		"click",
		(event) => {
			if (!root.isConnected || leaving || !dirty()) return
			const link = event.target instanceof Element ? event.target.closest("a[href]") : null
			if (!link) return
			const target = new URL(link.getAttribute("href")!, location.href)
			if (target.pathname === location.pathname && target.search === location.search) return
			if (
				forms.some((form) => form.getAttribute("aria-busy") === "true") ||
				!window.confirm("Tienes cambios sin guardar. ¿Quieres salir y descartarlos?")
			) {
				event.preventDefault()
				event.stopImmediatePropagation()
			} else leaving = true
		},
		{ capture: true, signal }
	)
	window.addEventListener(
		"beforeunload",
		(event) => {
			if (!root.isConnected || leaving || !dirty()) return
			event.preventDefault()
			event.returnValue = ""
		},
		{ signal }
	)
	window.addEventListener(
		"pageshow",
		() => {
			leaving = false
		},
		{ signal }
	)
}
bindExperienceDrafts()
document.addEventListener("astro:page-load", bindExperienceDrafts)
document.addEventListener("fastt:operation-refreshed", bindExperienceDrafts)
