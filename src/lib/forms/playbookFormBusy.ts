export function setPlaybookSubmitBusy(form: HTMLFormElement, busy: boolean, busyLabel?: string) {
	const formId = form.id.trim()
	const buttons = [
		...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
		...(formId
			? [...document.querySelectorAll<HTMLButtonElement>(`button[form="${CSS.escape(formId)}"]`)]
			: []),
	]
	for (const button of buttons) {
		button.disabled = busy
		button.setAttribute("aria-busy", busy ? "true" : "false")
		const showsProgress = button.value === "continue" || button.id === "submitBtn"
		if (!showsProgress) continue
		if (busy && busyLabel) {
			if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent?.trim() ?? ""
			button.replaceChildren(document.createTextNode(busyLabel))
			const spinner = document.createElement("span")
			spinner.dataset.playbookBusySpinner = "true"
			spinner.className =
				"inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
			spinner.setAttribute("aria-hidden", "true")
			button.prepend(spinner)
			continue
		}
		if (!busy && button.dataset.idleLabel) {
			button.textContent = button.dataset.idleLabel
			delete button.dataset.idleLabel
		}
	}
}
