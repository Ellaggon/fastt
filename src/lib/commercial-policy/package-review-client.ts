import type { previewCommercialPolicyPackage } from "./package-ratification"
type Preview = Awaited<ReturnType<typeof previewCommercialPolicyPackage>>
const messages: Record<string, string> = {
	policy_package_changed: "El paquete cambió. Vuelve a revisar las versiones antes de aprobar.",
	policy_package_invalid:
		"Hay controles pendientes en el paquete. No se guardó ninguna aprobación.",
	policy_package_in_progress: "La aprobación está en curso. Conserva esta pantalla.",
	forbidden: "Tu cuenta no tiene los tres permisos de ratificación.",
	idempotency_key_reused_with_different_payload: "La solicitud cambió. Revisa otra vez el paquete.",
}

export function bindPolicyPackageReview() {
	document.querySelectorAll<HTMLElement>("[data-policy-package]").forEach((root) => {
		if (root.dataset.bound) return
		root.dataset.bound = "true"
		const previewButton = root.querySelector<HTMLButtonElement>("[data-package-preview]")
		if (!previewButton) return
		const dialog = root.querySelector<HTMLDialogElement>("[data-package-dialog]")!
		const form = root.querySelector<HTMLFormElement>("[data-package-approval]")!
		const feedback = root.querySelector<HTMLElement>("[data-package-feedback]")!
		const decisionFeedback = root.querySelector<HTMLElement>("[data-package-decision-feedback]")!
		const submit = form.querySelector<HTMLButtonElement>("[data-package-submit]")!
		const allowed = !submit.disabled
		let preview: Preview | null = null
		let busy = false
		let commandKey = ""
		let commandPayload = ""
		const selected = () =>
			Array.from(root.querySelectorAll<HTMLInputElement>('[name="packageVersion"]:checked'))
				.map((input) => input.value)
				.sort()
		root.addEventListener("change", (event) => {
			if (!(event.target instanceof HTMLInputElement) || event.target.name !== "packageVersion")
				return
			preview = null
			if (previewButton) previewButton.disabled = !selected().length || busy
			root.querySelector<HTMLElement>("[data-package-count]")!.textContent =
				`${selected().length} seleccionadas`
		})
		root.querySelector("[data-package-close]")!.addEventListener("click", () => {
			if (!busy) dialog.close()
		})
		dialog.addEventListener("cancel", (event) => {
			if (busy) event.preventDefault()
		})
		function showError(target: HTMLElement, code: string) {
			if (code === "reauthentication_required") {
				const link = document.createElement("a")
				link.textContent = "Confirmar sesión"
				link.className = "font-semibold underline"
				link.href = `/auth/mfa?returnTo=${encodeURIComponent(location.pathname + location.search)}`
				target.replaceChildren(document.createTextNode("MFA reciente requerido. "), link)
			} else
				target.textContent =
					messages[code] ??
					"No se pudo completar la operación. Comprueba el estado antes de reintentar."
		}
		previewButton?.addEventListener("click", async () => {
			if (busy || !selected().length) return
			busy = true
			previewButton.disabled = true
			feedback.textContent = "Comprobando versiones…"
			try {
				const response = await fetch("/api/admin/commercial-policies/package", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "preview", versionIds: selected() }),
				})
				const data = await response.json()
				if (!response.ok || !data.ok) {
					showError(feedback, data.error)
					return
				}
				preview = data as Preview
				form.reset()
				decisionFeedback.textContent = ""
				const list = dialog.querySelector<HTMLOListElement>("[data-package-versions]")!
				list.replaceChildren()
				for (const version of preview.versions) {
					const item = document.createElement("li")
					item.className = "border-t border-slate-200 pt-3 text-sm break-words"
					const link = document.createElement("a")
					link.textContent = `${version.label} · versión ${version.version}`
					const detailId = `policy-${version.id}`
					const detailUrl = new URL(location.href)
					detailUrl.searchParams.delete("holder")
					detailUrl.hash = detailId
					link.href = document.getElementById(detailId) ? `#${detailId}` : detailUrl.href
					link.className = "font-semibold underline"
					link.addEventListener("click", () => dialog.close())
					const details = document.createElement("p")
					const start = new Date(version.effectiveFrom).toLocaleDateString("es-BO", {
						timeZone: "UTC",
					})
					const end = version.effectiveTo
						? new Date(version.effectiveTo).toLocaleDateString("es-BO", { timeZone: "UTC" })
						: "sin fin definido"
					details.textContent = `${version.country} · ${version.requirements.length} requisitos · ${version.pendingAreas.length} aprobaciones pendientes · vigencia ${start} — ${end}`
					item.append(link, details)
					if (version.errors.length) {
						const warning = document.createElement("p")
						warning.textContent = "Contrato incompleto: requiere corrección antes de ratificar."
						warning.className = "text-red-700"
						item.append(warning)
					}
					list.append(item)
				}
				dialog.querySelector<HTMLElement>("[data-package-preview-summary]")!.textContent =
					`${preview.versions.length} versiones · Políticas, Finanzas y Operaciones Tours`
				submit.disabled = !allowed || preview.versions.some((version) => version.errors.length)
				feedback.textContent = ""
				dialog.showModal()
			} catch {
				feedback.textContent = "No se pudo obtener la revisión del paquete."
			} finally {
				busy = false
				previewButton.disabled = !selected().length
			}
		})
		form.addEventListener("submit", async (event) => {
			event.preventDefault()
			if (busy || !allowed || !preview || !form.reportValidity()) return
			const fields = new FormData(form)
			const payload = JSON.stringify({
				action: "approve",
				versionIds: preview.versions.map((version) => version.id),
				fingerprint: preview.fingerprint,
				approvalReference: fields.get("approvalReference"),
				reviewedAreas: fields.getAll("reviewedAreas"),
			})
			if (payload !== commandPayload) {
				commandKey = crypto.randomUUID()
				commandPayload = payload
			}
			busy = true
			submit.disabled = true
			decisionFeedback.textContent = "Registrando aprobaciones…"
			try {
				const response = await fetch("/api/admin/commercial-policies/package", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json", "Idempotency-Key": commandKey },
					body: payload,
				})
				const data = await response.json()
				if (!response.ok || !data.ok) {
					showError(decisionFeedback, data.error)
					if (data.error === "policy_package_changed") preview = null
					return
				}
				window.location.reload()
			} catch {
				decisionFeedback.textContent =
					"Respuesta no confirmada. Conserva esta pantalla para consultar o reintentar la misma solicitud."
			} finally {
				busy = false
				submit.disabled =
					!allowed || !preview || preview.versions.some((version) => version.errors.length)
			}
		})
	})
}
