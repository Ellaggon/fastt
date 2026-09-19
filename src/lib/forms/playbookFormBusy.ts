export function setPlaybookSubmitBusy(form: HTMLFormElement, busy: boolean) {
	const formId = form.id.trim()
	const buttons = [
		...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
		...(formId
			? [...document.querySelectorAll<HTMLButtonElement>(`button[form="${CSS.escape(formId)}"]`)]
			: []),
	]
	for (const button of buttons) button.disabled = busy
}
