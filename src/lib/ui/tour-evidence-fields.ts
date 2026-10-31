import { documentCaptureSchema } from "@/shared/domain/document-definition"

document.addEventListener("change", (event) => {
	const select = event.target
	if (!(select instanceof HTMLSelectElement) || !select.matches("[data-document-definition]"))
		return
	const form = select.form
	if (!form) return
	let capture
	try {
		const raw = select.selectedOptions[0]?.dataset.capture
		capture = raw ? documentCaptureSchema.parse(JSON.parse(raw)) : null
	} catch {
		return
	}
	for (const name of ["issuer", "issuedAt", "expiresAt"] as const) {
		const field = form.querySelector<HTMLInputElement>(`input[name="${name}"]`)
		if (!field) continue
		const mode = capture?.[name] ?? "optional"
		field.required = mode === "required"
		field.disabled = mode === "not_applicable"
		const label = field.closest("label")
		if (label) label.hidden = field.disabled
	}
	const subject = form.querySelector<HTMLSelectElement>("[data-evidence-subject]")
	if (!subject) return
	for (const option of subject.options) {
		if (!option.value) continue
		option.disabled = Boolean(
			capture && !capture.allowedSubjectTypes.some((value) => value === option.value)
		)
		option.hidden = option.disabled
	}
	if (subject.selectedOptions[0]?.disabled) subject.value = ""
	subject.dispatchEvent(new Event("change", { bubbles: true }))
})

document.addEventListener("change", (event) => {
	const type = event.target
	if (!(type instanceof HTMLSelectElement) || type.name !== "type") return
	const definition = type.form?.querySelector<HTMLSelectElement>("[data-document-definition]")
	if (!definition) return
	definition.value = ""
	for (const option of definition.options) {
		if (!option.value) continue
		option.hidden = option.dataset.definitionFamily !== type.value.split("::")[0]
		option.disabled = option.hidden
	}
})

document.addEventListener("change", (event) => {
	const target = event.target
	if (!(target instanceof HTMLSelectElement) || !target.matches("[data-evidence-subject]")) return
	const form = target.closest("form")
	const text = form?.querySelector<HTMLInputElement>("[data-evidence-subject-text]")
	const resource = form?.querySelector<HTMLSelectElement>("[data-evidence-subject-resource]")
	if (!text || !resource) return
	const resourceSubject =
		target.value === "person" || target.value === "resource" || target.value === "third_party"
	text.disabled = resourceSubject
	text.hidden = resourceSubject
	for (const option of resource.options) {
		if (option.value)
			option.hidden =
				target.value === "third_party"
					? option.dataset.resourceType !== "service_operator"
					: target.value === "person"
						? !["guide", "driver"].includes(option.dataset.resourceType ?? "")
						: option.dataset.resourceType === "service_operator"
	}
	resource.value = ""
	resource.disabled = !resourceSubject
	resource.hidden = !resourceSubject
})
document.addEventListener("click", async (event) => {
	const target =
		event.target instanceof Element
			? event.target.closest<HTMLButtonElement>("[data-register-evidence-guide]")
			: null
	if (!target || target.disabled) return
	const form = target.closest("form")
	const input = form?.querySelector<HTMLInputElement>("[data-guide-name]")
	const select = form?.querySelector<HTMLSelectElement>("[data-evidence-guide]")
	const status = form?.querySelector<HTMLElement>("[data-guide-registration-status]")
	if (!input || !select || !status) return
	if (input.value.trim().length < 2) {
		status.textContent = "Escribe el nombre completo del guía."
		input.focus()
		return
	}
	target.disabled = true
	status.textContent = "Registrando guía…"
	try {
		const response = await fetch("/api/tours/resources", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				intent: "create_resource",
				type: "guide",
				name: input.value.trim(),
			}),
		})
		const data = await response.json()
		if (!response.ok || !data.resource?.id) throw new Error("registration_failed")
		select.add(new Option(data.resource.name, data.resource.id, true, true))
		status.textContent =
			"Guía registrado. Comprueba que coincide con la credencial antes de enviarla."
		select.focus()
	} catch {
		status.textContent = "No se pudo registrar. Revisa tu sesión e inténtalo nuevamente."
	} finally {
		target.disabled = false
	}
})
