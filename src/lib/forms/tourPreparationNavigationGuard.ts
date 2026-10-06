/** Server persistence, local drafts and in-flight uploads are distinct states. */
function formSignature(form: HTMLFormElement): string {
	return JSON.stringify(
		Array.from(new FormData(form).entries()).map(([name, value]) => [
			name,
			typeof value === "string" ? value : `${value.name}:${value.size}:${value.lastModified}`,
		])
	)
}
export function installTourPreparationNavigationGuard() {
	const root = document.querySelector<HTMLElement>("[data-tour-navigation-guard]")
	if (!root || root.dataset.guardInstalled) return
	root.dataset.guardInstalled = "true"
	const baselines = new Map<HTMLFormElement, string>()
	root.querySelectorAll("form").forEach((form) => baselines.set(form, formSignature(form)))
	const touched = new WeakSet<HTMLFormElement>()
	const controls = new Map<Element, string>()
	const editedControls = new WeakSet<Element>()
	const controlSignature = (element: Element) => {
		const control = element as HTMLInputElement
		return JSON.stringify([
			control.value,
			control.checked,
			Array.from(control.files ?? []).map((file) => [file.name, file.size, file.lastModified]),
		])
	}
	const captureControls = () =>
		root.querySelectorAll("input, select, textarea").forEach((control) => {
			if (
				"value" in control &&
				!["hidden", "submit", "button", "password"].includes((control as HTMLInputElement).type) &&
				!controls.has(control)
			)
				controls.set(control, controlSignature(control))
		})
	captureControls()
	let dynamicSaved = false
	const dirty = () =>
		Array.from(baselines).some(
			([form, signature]) =>
				form.isConnected && touched.has(form) && formSignature(form) !== signature
		) ||
		Array.from(controls).some(
			([control, signature]) =>
				control.isConnected &&
				editedControls.has(control) &&
				controlSignature(control) !== signature
		) ||
		(!dynamicSaved && !!root.querySelector('[data-playbook-dirty="true"]'))
	const busy = () =>
		!!root.querySelector(
			'[data-uploading="true"], [data-playbook-busy="true"], [data-saving="true"]'
		)
	const click = (event: MouseEvent) => {
		if (
			!root.isConnected ||
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return
		const link =
			event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null
		if (!link || link.target === "_blank" || link.hasAttribute("download")) return
		const destination = new URL(link.href, window.location.href)
		if (
			destination.pathname + destination.search ===
			window.location.pathname + window.location.search
		)
			return
		if (!busy() && !dirty()) return
		if (busy() || !window.confirm("Hay cambios sin guardar. ¿Quieres salir sin guardarlos?")) {
			event.preventDefault()
			event.stopImmediatePropagation()
			if (busy())
				window.alert("Espera a que termine la carga o el guardado antes de cambiar de etapa.")
		} else {
			dynamicSaved = true
			baselines.forEach((_signature, form) => baselines.set(form, formSignature(form)))
			controls.forEach((_signature, control) => controls.set(control, controlSignature(control)))
		}
	}
	const unload = (event: BeforeUnloadEvent) => {
		if (root.isConnected && (busy() || dirty())) {
			event.preventDefault()
			event.returnValue = ""
		}
	}
	const onSaved = (event: Event) => {
		const form = event instanceof CustomEvent ? event.detail?.form : null
		if (form instanceof HTMLFormElement) {
			baselines.set(form, formSignature(form))
			controls.forEach((_signature, control) => {
				if (form.contains(control)) controls.set(control, controlSignature(control))
			})
		} else {
			baselines.forEach((_signature, current) => baselines.set(current, formSignature(current)))
			controls.forEach((_signature, control) => controls.set(control, controlSignature(control)))
			dynamicSaved = true
		}
	}
	const onEdit = (event: Event) => {
		const form = event.target instanceof Element ? event.target.closest("form") : null
		if (form) touched.add(form)
		if (event.target instanceof Element) editedControls.add(event.target)
		dynamicSaved = false
	}
	const observer = new MutationObserver(() => {
		captureControls()
		if (!root.querySelector('[data-playbook-dirty="true"]')) dynamicSaved = false
		root.querySelectorAll("form").forEach((form) => {
			if (!baselines.has(form)) baselines.set(form, formSignature(form))
		})
	})
	observer.observe(root, { childList: true, subtree: true })
	document.addEventListener("click", click, true)
	root.addEventListener("input", onEdit)
	root.addEventListener("change", onEdit)
	document.addEventListener("fastt:playbook-saved", onSaved)
	window.addEventListener("beforeunload", unload)
	document.addEventListener(
		"astro:before-swap",
		() => {
			observer.disconnect()
			document.removeEventListener("click", click, true)
			document.removeEventListener("fastt:playbook-saved", onSaved)
			window.removeEventListener("beforeunload", unload)
		},
		{ once: true }
	)
}
