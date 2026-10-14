/** Archiving retires an option while preserving its commercial history. */
export function bindOptionArchival(
	root: HTMLElement,
	request: typeof fetch = fetch,
	reload = () => window.location.reload()
) {
	if (root.dataset.archivalBound) return
	root.dataset.archivalBound = "true"
	const dialog = root.querySelector<HTMLDialogElement>("[data-archive-option-dialog]")
	const confirm = dialog?.querySelector<HTMLButtonElement>("[data-confirm-archive-option]")
	const cancel = dialog?.querySelector<HTMLButtonElement>("[data-cancel-archive-option]")
	const error = dialog?.querySelector<HTMLElement>("[data-archive-option-error]")
	if (!dialog || !confirm || !cancel || !error) return
	let selected: HTMLButtonElement | null = null,
		busy = false
	root.addEventListener("click", (event) => {
		const button = (event.target as Element)?.closest<HTMLButtonElement>("[data-archive-option]")
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
		error.textContent = "Archivando opción…"
		try {
			const form = new FormData()
			form.set("variantId", selected.dataset.archiveOption ?? "")
			form.set("lifecycleState", "archived")
			const response = await request("/api/variant/lifecycle", { method: "POST", body: form })
			const result = await response.json().catch(() => null)
			if (!response.ok || result?.lifecycleState !== "archived")
				throw new Error(
					response.status === 401
						? "Tu sesión venció. Inicia sesión y vuelve a intentarlo."
						: (result?.message ??
								"No pudimos archivar la opción. Reintenta; los datos guardados se conservan.")
				)
			const row = selected.closest("li")
			dialog.close()
			row?.remove()
			reload()
			const feedback = root.querySelector<HTMLElement>("[data-option-archive-feedback]")
			if (feedback) {
				feedback.textContent = "Opción archivada. Sus tarifas, fechas y reservas se conservan."
				feedback.tabIndex = -1
				feedback.focus()
			}
		} catch (reason) {
			error.textContent =
				reason instanceof Error
					? reason.message
					: "No pudimos archivar la opción. Vuelve a intentarlo."
		} finally {
			busy = false
			confirm.disabled = false
			cancel.disabled = false
			selected.disabled = false
		}
	})
}
