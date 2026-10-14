/** Closing an assistant only abandons its continuation session; saved commercial data remains. */
export function bindOptionSessionDismissal(root: HTMLElement, request: typeof fetch = fetch) {
	if (root.dataset.dismissalBound) return
	root.dataset.dismissalBound = "true"
	const dialog = root.querySelector<HTMLDialogElement>("[data-dismiss-session-dialog]")
	const confirm = dialog?.querySelector<HTMLButtonElement>("[data-confirm-dismiss-session]")
	const cancel = dialog?.querySelector<HTMLButtonElement>("[data-cancel-dismiss-session]")
	const error = dialog?.querySelector<HTMLElement>("[data-dismiss-session-error]")
	if (!dialog || !confirm || !cancel || !error) return
	let selected: HTMLButtonElement | null = null,
		busy = false
	root.addEventListener("click", (event) => {
		const button = (event.target as Element)?.closest<HTMLButtonElement>(
			"[data-abandon-option-session]"
		)
		if (!button || busy) return
		selected = button
		error.textContent = ""
		dialog.showModal()
	})
	cancel.addEventListener("click", () => {
		if (!busy) dialog.close()
	})
	dialog.addEventListener("cancel", (event) => {
		if (busy) event.preventDefault()
	})
	dialog.addEventListener("close", () => {
		selected?.focus()
	})
	confirm.addEventListener("click", async () => {
		if (!selected || busy) return
		busy = true
		confirm.disabled = true
		cancel.disabled = true
		selected.disabled = true
		error.textContent = "Cerrando asistente…"
		try {
			const response = await request("/api/onboarding/tour-option-session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "abandon",
					sessionId: selected.dataset.abandonOptionSession,
				}),
			})
			const result = await response.json().catch(() => null)
			if (!response.ok || result?.ok !== true)
				throw new Error(
					response.status === 401
						? "Tu sesión venció. Inicia sesión y vuelve a intentarlo."
						: (result?.message ??
								"No pudimos cerrar el asistente. Reintenta; los datos guardados se conservan.")
				)
			const row = selected.closest("li")
			dialog.close()
			row?.remove()
			const feedback = root.querySelector<HTMLElement>("[data-option-session-feedback]")
			if (feedback) {
				feedback.textContent = "Asistente cerrado. La opción y sus datos guardados se conservan."
				feedback.tabIndex = -1
				feedback.focus()
			}
		} catch (reason) {
			error.textContent =
				reason instanceof Error
					? reason.message
					: "No pudimos cerrar el asistente. Vuelve a intentarlo."
		} finally {
			busy = false
			confirm.disabled = false
			cancel.disabled = false
			selected.disabled = false
		}
	})
}
