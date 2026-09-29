const errorMessages: Record<string, string> = {
	invalid_message: "Escribe entre 12 y 2000 caracteres para que podamos revisar el caso.",
	invalid_context: "Revisa el motivo y el negocio seleccionado.",
	invalid_request_key: "Actualiza la página y vuelve a intentarlo.",
	request_limit_reached:
		"Hay demasiadas solicitudes recientes. Revisa tus casos abiertos antes de enviar otra.",
	not_found: "La solicitud no existe en este negocio o ya no está disponible.",
	invalid_status: "Elige cómo debe quedar esta solicitud.",
	invalid_origin: "Actualiza la página y vuelve a intentarlo desde Fastt.",
	idempotency_conflict:
		"Este envío ya se guardó con otro contenido. Actualiza la página antes de enviar una versión nueva.",
	support_unavailable:
		"No pudimos guardar la solicitud. Tu mensaje sigue aquí; inténtalo de nuevo.",
}

export function attachProviderSupportForms() {
	for (const form of document.querySelectorAll<HTMLFormElement>("[data-support-form]")) {
		form.addEventListener("submit", async (event) => {
			event.preventDefault()
			const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
			const feedback = form.querySelector<HTMLElement>("[data-support-feedback]")
			if (submit) submit.disabled = true
			if (feedback) {
				feedback.textContent = "Guardando solicitud…"
				feedback.setAttribute("role", "status")
			}
			try {
				const response = await fetch(form.action, {
					method: "POST",
					body: new FormData(form),
					headers: { accept: "application/json" },
				})
				const payload = await response.json().catch(() => ({}))
				if (!response.ok || !payload.ok) {
					if (feedback)
						feedback.textContent =
							errorMessages[payload.error] ?? "No pudimos guardar la solicitud. Inténtalo de nuevo."
					return
				}
				const target = new URL(window.location.href)
				target.searchParams.set("request", String(payload.requestId))
				target.searchParams.set("result", form.dataset.success ?? "sent")
				target.searchParams.delete("error")
				window.location.assign(target.href)
			} catch {
				if (feedback)
					feedback.textContent =
						"Se perdió la conexión. Tu mensaje sigue aquí; vuelve a intentarlo."
			} finally {
				if (submit) submit.disabled = false
			}
		})
	}
}
