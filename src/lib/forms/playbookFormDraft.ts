type DraftControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

type DraftEntry = {
	key: string
	type: string
	value: string
	checked?: boolean
}

type DraftOptions = {
	key: string
	enabled?: boolean
	excludeNames?: string[]
}

const excludedTypes = new Set(["button", "file", "hidden", "image", "password", "reset", "submit"])

function storageAvailable(): boolean {
	try {
		const key = "__fastt_form_draft_test__"
		window.sessionStorage.setItem(key, "1")
		window.sessionStorage.removeItem(key)
		return true
	} catch {
		return false
	}
}

function isDraftControl(element: Element, excludeNames: Set<string>): element is DraftControl {
	if (
		!(
			element instanceof HTMLInputElement ||
			element instanceof HTMLTextAreaElement ||
			element instanceof HTMLSelectElement
		)
	) {
		return false
	}
	const name = String(element.name || element.id || "").trim()
	if (!name || excludeNames.has(name)) return false
	if (element instanceof HTMLInputElement && excludedTypes.has(element.type)) return false
	return true
}

function controlKey(control: DraftControl): string {
	return String(control.name || control.id)
}

function collectEntries(form: HTMLFormElement, excludeNames: Set<string>): DraftEntry[] {
	const entries: DraftEntry[] = []
	for (const element of Array.from(form.elements)) {
		if (!isDraftControl(element, excludeNames)) continue
		const type = element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase()
		entries.push({
			key: controlKey(element),
			type,
			value: element.value,
			checked: element instanceof HTMLInputElement ? element.checked : undefined,
		})
	}
	return entries
}

function restoreEntries(form: HTMLFormElement, entries: DraftEntry[], excludeNames: Set<string>) {
	for (const element of Array.from(form.elements)) {
		if (!isDraftControl(element, excludeNames)) continue
		const isChoice =
			element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
		const match = entries.find(
			(entry) => entry.key === controlKey(element) && (!isChoice || entry.value === element.value)
		)
		if (!match) continue
		if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
			element.checked = Boolean(match.checked)
			continue
		}
		element.value = match.value
		element.dispatchEvent(new Event("input", { bubbles: true }))
		element.dispatchEvent(new Event("change", { bubbles: true }))
	}
}

export function bindPlaybookFormDraft(form: HTMLFormElement | null, options: DraftOptions) {
	if (!form || options.enabled === false || typeof window === "undefined" || !storageAvailable()) {
		return {
			clear: () => {
				if (typeof document !== "undefined")
					document.dispatchEvent(new CustomEvent("fastt:playbook-saved", { detail: { form } }))
			},
		}
	}

	const storageKey = `fastt:playbook-form-draft:${options.key}`
	const excludeNames = new Set(options.excludeNames ?? [])

	let cleared = false
	const save = () => {
		if (cleared) return
		const entries = collectEntries(form, excludeNames)
		window.sessionStorage.setItem(storageKey, JSON.stringify({ entries, savedAt: Date.now() }))
	}

	const restore = () => {
		const raw = window.sessionStorage.getItem(storageKey)
		if (!raw) return
		try {
			const parsed = JSON.parse(raw) as { entries?: DraftEntry[] }
			if (Array.isArray(parsed.entries)) restoreEntries(form, parsed.entries, excludeNames)
		} catch {
			window.sessionStorage.removeItem(storageKey)
		}
	}

	const clear = () => {
		document.dispatchEvent(new CustomEvent("fastt:playbook-saved", { detail: { form } }))
		cleared = true
		window.sessionStorage.removeItem(storageKey)
	}

	restore()
	form.addEventListener("input", save)
	form.addEventListener("change", save)
	window.addEventListener("beforeunload", save)
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") save()
	})
	window.addEventListener("pagehide", save)

	return { clear }
}
