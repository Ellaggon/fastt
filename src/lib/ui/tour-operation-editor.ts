import { tourOperationSchema } from "@/shared/domain/tour-operation"

function disposeSelects(root: ParentNode) {
	root
		.querySelectorAll("[data-fastt-select]")
		.forEach((select) => select.dispatchEvent(new Event("fastt:dispose")))
}

function bindOperationEditors() {
	document
		.querySelectorAll<HTMLFormElement>("[data-tour-operating-context-form]")
		.forEach((form) => {
			if (form.dataset.ready) return
			form.dataset.ready = "true"
			const fieldset = form.querySelector("fieldset")!
			if (fieldset.disabled) return
			const status = form.querySelector<HTMLElement>("[data-operation-status]")!
			const save = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
			const editor = form.closest<HTMLDetailsElement>("details")!
			const list = form.querySelector<HTMLElement>("[data-transport-list]")!
			let initialRows = list.innerHTML
			let pending = false
			const value = (selector: string, root: ParentNode = form) =>
				root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? ""
			const operation = () => ({
				version: 2,
				executionMode: value('[name="executionMode"]'),
				guidingService: form.querySelector<HTMLInputElement>('[name="guidingService"]')!.checked,
				characteristics: Array.from(
					form.querySelectorAll<HTMLInputElement>('[name="activityClass"]:checked'),
					(input) => input.value
				),
				operatorResourceId:
					value('[name="executionMode"]') === "external"
						? value('[name="operatorResourceId"]') || null
						: null,
				waterActivity: form.querySelector('[name="waterDecision"]')
					? value('[name="waterDecision"]') === "yes"
					: form.querySelector<HTMLInputElement>('[name="waterActivity"]')!.checked,
				airActivity: form.querySelector('[name="airDecision"]')
					? value('[name="airDecision"]') === "yes"
					: form.querySelector<HTMLInputElement>('[name="airActivity"]')!.checked,
				foodHandling: value('[name="foodHandling"]'),
				resourceIds: Array.from(
					form.querySelectorAll<HTMLInputElement>('[name="resourceId"]:checked'),
					(input) => input.value
				),
				transportServices: Array.from(
					list.querySelectorAll<HTMLElement>("[data-transport-service]"),
					(row) => ({
						id: row.dataset.serviceId,
						label: value("[data-service-label]", row),
						providedBy: value("[data-service-provider]", row),
						operatorResourceId:
							value("[data-service-provider]", row) === "external"
								? value("[data-service-operator]", row) || null
								: null,
					})
				),
			})
			const fingerprint = () =>
				JSON.stringify([
					operation(),
					[...new FormData(form).entries()],
					[
						"[data-partner-name]",
						"[data-partner-country]",
						"[data-partner-id]",
						"[data-resource-name]",
					].map((selector) => value(selector)),
				])
			let initial = fingerprint()
			const sync = () => {
				const external = value('[name="executionMode"]') === "external"
				form.querySelector<HTMLElement>("[data-main-operator]")!.hidden = !external
				form.querySelector<HTMLSelectElement>('[name="operatorResourceId"]')!.required = external
				list.querySelectorAll<HTMLElement>("[data-transport-service]").forEach((row) => {
					const select = row.querySelector<HTMLSelectElement>("[data-service-operator]")!
					select.hidden = value("[data-service-provider]", row) !== "external"
					const wrapper = select.closest<HTMLElement>("[data-fastt-select]")
					if (wrapper) wrapper.hidden = select.hidden
					select.required = !select.hidden
				})
				form.dataset.dirty = fingerprint() !== initial ? "true" : "false"
				save.disabled = pending || form.dataset.dirty !== "true"
			}
			form.addEventListener("input", sync)
			form.addEventListener("change", sync)
			form.addEventListener("click", async (event) => {
				const target = event.target instanceof Element ? event.target.closest("button") : null
				if (!target) return
				if (target.matches("[data-add-transport]")) {
					if (list.children.length >= 20) return
					const row = form
						.querySelector<HTMLTemplateElement>("[data-transport-template]")!
						.content.firstElementChild!.cloneNode(true) as HTMLElement
					row.dataset.serviceId = crypto.randomUUID()
					list.append(row)
					const previousTransport = form.querySelector<HTMLSelectElement>(
						'[name="legacyTransportDecision"]'
					)
					if (previousTransport) {
						previousTransport.value = "yes"
						previousTransport.dispatchEvent(new Event("change", { bubbles: true }))
					}
					document.dispatchEvent(
						new CustomEvent("fastt:content-updated", { detail: { root: row } })
					)
					row.querySelector<HTMLInputElement>("input")?.focus()
				}
				if (target.matches("[data-remove-transport]")) {
					const row = target.closest("[data-transport-service]")
					if (row) {
						disposeSelects(row)
						row.remove()
					}
				}
				if (target.matches("[data-operation-cancel]")) {
					form.reset()
					disposeSelects(list)
					list.innerHTML = initialRows
					list.querySelectorAll<HTMLElement>("[data-fastt-select]").forEach((root) => {
						delete root.dataset.fasttSelectReady
					})
					document.dispatchEvent(
						new CustomEvent("fastt:content-updated", { detail: { root: list } })
					)
					status.textContent = ""
					editor.open = form.dataset.operationComplete !== "true"
					if (editor.open) form.querySelector<HTMLSelectElement>('[name="executionMode"]')?.focus()
					else editor.querySelector("summary")?.focus()
				}
				if (target.matches("[data-register-resource]")) {
					const feedback = form.querySelector<HTMLElement>("[data-resource-status]")!
					const name = value("[data-resource-name]").trim()
					if (name.length < 2) {
						feedback.textContent = "Indica el nombre del recurso."
						return
					}
					target.disabled = true
					try {
						const response = await fetch("/api/tours/resources", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								intent: "create_resource",
								type: value("[data-resource-type]"),
								name,
							}),
						})
						const result = await response.json()
						if (!response.ok) throw new Error("registration_failed")
						const label = form
							.querySelector<HTMLTemplateElement>("[data-resource-template]")!
							.content.firstElementChild!.cloneNode(true) as HTMLElement
						label.querySelector<HTMLInputElement>("input")!.value = result.resource.id
						label.querySelector<HTMLElement>("[data-resource-label]")!.textContent =
							result.resource.name
						form.querySelector("[data-resource-list]")!.append(label)
						form.querySelector<HTMLInputElement>("[data-resource-name]")!.value = ""
						feedback.textContent =
							"Recurso registrado. Selecciónalo para vincularlo; no se han verificado sus respaldos."
					} catch {
						feedback.textContent = "No se pudo registrar. Conservamos los datos para reintentar."
					} finally {
						target.disabled = false
					}
				}
				if (target.matches("[data-register-partner]")) {
					const partnerStatus = form.querySelector<HTMLElement>("[data-partner-status]")!
					const name = value("[data-partner-name]").trim()
					const country = value("[data-partner-country]").trim().toUpperCase()
					if (name.length < 2 || !/^[A-Z]{2}$/.test(country)) {
						partnerStatus.textContent = "Indica el nombre legal y el país de dos letras."
						return
					}
					target.disabled = true
					try {
						const response = await fetch("/api/tours/resources", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								intent: "create_resource",
								type: "service_operator",
								name,
								identity: { country, registrationId: value("[data-partner-id]").trim() || null },
							}),
						})
						const result = await response.json()
						if (!response.ok) throw new Error("failed")
						form.querySelectorAll<HTMLSelectElement>("[data-operator-select]").forEach((select) => {
							select.add(new Option(result.resource.name, result.resource.id))
							select.dispatchEvent(new Event("fastt:options-updated"))
						})
						form
							.querySelector<HTMLTemplateElement>("[data-transport-template]")!
							.content.querySelector<HTMLSelectElement>("[data-operator-select]")!
							.add(new Option(result.resource.name, result.resource.id))
						partnerStatus.textContent =
							"Prestador registrado. Selecciónalo en el servicio correspondiente; sus respaldos aún requieren revisión."
						form.querySelector<HTMLInputElement>("[data-partner-name]")!.value = ""
						form.querySelector<HTMLInputElement>("[data-partner-country]")!.value = ""
						form.querySelector<HTMLInputElement>("[data-partner-id]")!.value = ""
					} catch {
						partnerStatus.textContent =
							"No se pudo registrar. Conservamos los datos para reintentar."
					} finally {
						target.disabled = false
					}
				}
				sync()
			})
			form.addEventListener("submit", async (event) => {
				event.preventDefault()
				if (pending || !form.reportValidity()) return
				const parsed = tourOperationSchema.safeParse(operation())
				const previousTransport = value('[name="legacyTransportDecision"]')
				if (
					(previousTransport === "yes" && !list.children.length) ||
					(previousTransport === "no" && list.children.length)
				) {
					status.textContent =
						"Revisa los servicios de transporte para que coincidan con tu confirmación."
					return
				}
				if (!parsed.success) {
					status.textContent = parsed.error.issues.map((issue) => issue.message).join(" ")
					return
				}
				const body = new FormData(form)
				if (!body.getAll("jurisdictionCodes").length) {
					status.textContent = "Selecciona al menos un territorio."
					return
				}
				body.set("operation", JSON.stringify(parsed.data))
				pending = true
				fieldset.disabled = true
				form.setAttribute("aria-busy", "true")
				status.textContent = "Guardando operación…"
				sync()
				try {
					const response = await fetch(form.action, {
						method: "POST",
						headers: { Accept: "application/json" },
						body,
					})
					const result = await response.json()
					if (!response.ok) {
						status.textContent =
							response.status === 409
								? "Otra sesión cambió esta operación. Tus cambios siguen aquí. "
								: result.issues?.map((issue: { message: string }) => issue.message).join(" ") ||
									"Revisa los responsables, actividades y recursos seleccionados."
						if (response.status === 409) {
							const link = document.createElement("a")
							link.href = location.href
							link.target = "_blank"
							link.rel = "noopener noreferrer"
							link.className = "font-medium underline"
							link.textContent = "Comparar con la versión guardada en otra pestaña"
							status.append(link)
						}
						return
					}
					form.querySelector<HTMLInputElement>('[name="revision"]')!.value = String(
						result.context.revision
					)
					fieldset.disabled = false
					form.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
						input.defaultValue = input.value
						input.defaultChecked = input.checked
					})
					form.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
						for (const option of select.options) option.defaultSelected = option.selected
					})
					initialRows = list.innerHTML
					initial = fingerprint()
					form.dataset.dirty = "false"
					status.textContent = "Operación guardada. Actualizando requisitos…"
					const page = await fetch(location.href, {
						headers: { Accept: "text/html" },
						cache: "no-store",
					})
					if (!page.ok) throw new Error("refresh_failed")
					const html = new DOMParser().parseFromString(await page.text(), "text/html")
					const next = html.querySelector("[data-experience-requirements]")
					const current = form.closest("[data-experience-requirements]")
					if (!next || !current) throw new Error("refresh_failed")
					if (
						next.querySelector<HTMLInputElement>('[name="revision"]')?.value !==
						String(result.context.revision)
					)
						throw new Error("refresh_failed")
					disposeSelects(current)
					current.dispatchEvent(new Event("fastt:dispose"))
					current.replaceWith(next)
					document.dispatchEvent(
						new CustomEvent("fastt:content-updated", { detail: { root: next } })
					)
					document.dispatchEvent(new Event("fastt:operation-refreshed"))
					document
						.querySelector<HTMLElement>("#tour-operating-context")
						?.focus({ preventScroll: true })
				} catch {
					status.textContent =
						form.dataset.dirty === "false"
							? "Operación guardada. No se pudieron actualizar los requisitos; vuelve a cargar para consultarlos."
							: "No se pudo guardar. Tus cambios siguen aquí; inténtalo de nuevo."
				} finally {
					pending = false
					fieldset.disabled = false
					form.removeAttribute("aria-busy")
					sync()
				}
			})
			sync()
		})
}
bindOperationEditors()
document.addEventListener("astro:page-load", bindOperationEditors)
document.addEventListener("fastt:operation-refreshed", bindOperationEditors)
