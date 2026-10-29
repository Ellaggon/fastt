import { bindProposalReview } from "./proposal-review"

const messages: Record<string, string> = {
	correction_reason_required: "Explica qué debe corregirse, con al menos 12 caracteres.",
	forbidden: "Tu cuenta no tiene permiso para realizar esta acción.",
	declare_collection_first: "Declara primero el cobro directo para Tours.",
	proposal_obsolete: "La propuesta cambió. Actualiza la página para revisar su versión vigente.",
	authorized_signer_required:
		"La aceptación corresponde al representante autorizado de esta propuesta.",
	identity_changed:
		"Cambió la identidad o la modalidad de cobro. Solicita una propuesta actualizada.",
	proposal_expired: "La propuesta venció. Solicita una nueva versión.",
	consent_required: "Confirma que has leído y aceptas las condiciones.",
	verified_identity_and_tax_required:
		"Verifica el titular legal y su identidad fiscal antes de emitir la propuesta.",
	representation_required: "Registra la evidencia de representación revisada.",
	signer_not_member: "El representante debe pertenecer a la cuenta del proveedor.",
	holder_required: "Completa la declaración del titular antes de continuar.",
}
export function bindAgreementForms() {
	document.querySelectorAll<HTMLFormElement>("[data-agreement-form]").forEach((form) => {
		if (form.dataset.bound) return
		// A field named "action" shadows HTMLFormElement.action in the browser.
		const action = new URL(form.getAttribute("action") || location.href, document.baseURI)
		form.dataset.bound = "true"
		const draftKey = `commercial-form:${location.pathname}:${action.href}:${form.querySelector<HTMLInputElement>('[name="agreementId"], [name="versionId"]')?.value ?? "new"}:${form.querySelector<HTMLInputElement>('[name="approvalArea"]')?.value ?? ""}`
		if (action.pathname.startsWith("/api/admin/")) {
			try {
				const saved = sessionStorage.getItem(draftKey)
				if (saved) {
					const entries: Array<[string, string]> = JSON.parse(saved)
					form
						.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[name]")
						.forEach((field) => {
							if (field instanceof HTMLInputElement && field.type === "hidden") return
							const values = entries
								.filter(([name]) => name === field.name)
								.map(([, value]) => value)
							if (field instanceof HTMLInputElement && field.type === "checkbox")
								field.checked = values.includes(field.value)
							else if (values.length) {
								field.value = values[0]
								field.dispatchEvent(new Event("change", { bubbles: true }))
							}
						})
				}
			} catch {
				/* An unavailable browser store must not block the form. */
			}
		}
		let pending = false
		let commandKey = ""
		let commandPayload = ""
		const reviewed = bindProposalReview(form)
		form.addEventListener("submit", async (event) => {
			event.preventDefault()
			if (pending || !form.reportValidity() || !reviewed()) return
			pending = true
			const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'))
			const feedback = form.querySelector<HTMLElement>("[data-agreement-feedback]")!
			buttons.forEach((button) => {
				button.disabled = true
			})
			form.setAttribute("aria-busy", "true")
			feedback.textContent = "Guardando…"
			try {
				const asJson = form.hasAttribute("data-agreement-json")
				if (form.hasAttribute("data-idempotent-command")) {
					const payload = JSON.stringify([...new FormData(form).entries()])
					if (!commandKey || commandPayload !== payload) {
						commandKey = crypto.randomUUID()
						commandPayload = payload
					}
				}
				const response = await fetch(action.href, {
					method: "POST",
					headers: {
						Accept: "application/json",
						...(commandKey ? { "Idempotency-Key": commandKey } : {}),
						...(asJson ? { "Content-Type": "application/json" } : {}),
					},
					credentials: "same-origin",
					body: asJson
						? JSON.stringify(Object.fromEntries(new FormData(form)))
						: new FormData(form),
				})
				const data = await response.json().catch(() => ({}))
				if (response.status === 401 && data.error === "reauthentication_required") {
					try {
						sessionStorage.setItem(draftKey, JSON.stringify([...new FormData(form).entries()]))
					} catch {
						/* Keep the current form editable. */
					}
					const link = document.createElement("a")
					link.href = `/auth/mfa?returnTo=${encodeURIComponent(location.pathname + location.search)}`
					link.className = "font-semibold underline"
					link.textContent = "Confirmar sesión"
					feedback.replaceChildren(
						document.createTextNode("Confirma tu sesión para continuar. "),
						link
					)
					return
				}
				if (!response.ok || !data.ok) {
					if (data.fieldErrors && typeof data.fieldErrors === "object") {
						form.dispatchEvent(new Event("commercial-proposal:edit"))
						for (const [name, message] of Object.entries(data.fieldErrors)) {
							const field = form.elements.namedItem(name)
							if (
								typeof message === "string" &&
								(field instanceof HTMLInputElement ||
									field instanceof HTMLSelectElement ||
									field instanceof HTMLTextAreaElement)
							)
								field.setCustomValidity(message)
						}
						form.reportValidity()
					}
					feedback.textContent =
						messages[data.error] ??
						data.message ??
						"No se pudo guardar. Tus datos siguen aquí; inténtalo de nuevo."
					return
				}
				const url = new URL(window.location.href)
				try {
					sessionStorage.removeItem(draftKey)
				} catch {
					/* No draft to clear. */
				}
				url.searchParams.delete("error")
				url.searchParams.delete("result")
				window.location.assign(url.href)
			} catch {
				feedback.textContent = "No se pudo conectar. Tus datos siguen aquí; inténtalo de nuevo."
			} finally {
				pending = false
				form.removeAttribute("aria-busy")
				buttons.forEach((button) => {
					button.disabled = false
				})
			}
		})
	})
}
