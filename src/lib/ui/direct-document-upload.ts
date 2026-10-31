import {
	DOCUMENT_MULTIPART_FALLBACK_LIMIT_BYTES,
	submitDocumentMultipartFallback,
} from "@/lib/documents/direct-upload-fallback"

const pending = new WeakSet<HTMLFormElement>()

document.addEventListener(
	"submit",
	async (event) => {
		const form = event.target
		if (!(form instanceof HTMLFormElement)) return
		const action = new URL(form.action, location.href)
		if (action.origin !== location.origin || action.pathname !== "/api/provider/settings/documents")
			return
		const input = form.querySelector<HTMLInputElement>('input[type="file"][name="file"]')
		const file = input?.files?.[0]
		if (!file) return
		event.preventDefault()
		if (pending.has(form)) return
		pending.add(form)
		const data = new FormData(form)
		const multipartData = new FormData(form)
		const controls = Array.from(form.elements).filter(
			(element): element is HTMLButtonElement =>
				element instanceof HTMLButtonElement && element.type === "submit"
		)
		const disabled = controls.map((button) => button.disabled)
		controls.forEach((button) => {
			button.disabled = true
		})
		form.setAttribute("aria-busy", "true")
		let message = form.querySelector<HTMLElement>("[data-direct-upload-status]")
		if (!message) {
			message = document.createElement("p")
			message.className = "fastt-notice text-sm"
			message.dataset.directUploadStatus = "true"
			message.setAttribute("role", "status")
			message.setAttribute("aria-live", "polite")
			form.append(message)
		}
		try {
			if (file.size <= 0 || file.size > 12 * 1024 * 1024) throw new Error("size")
			message.textContent = "Preparando archivo…"
			const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
			const sha256 = Array.from(new Uint8Array(digest), (byte) =>
				byte.toString(16).padStart(2, "0")
			).join("")
			const mimeType =
				file.type ||
				(/\.pdf$/i.test(file.name)
					? "application/pdf"
					: /\.png$/i.test(file.name)
						? "image/png"
						: /\.jpe?g$/i.test(file.name)
							? "image/jpeg"
							: "")
			const initialized = await fetch("/api/provider/settings/documents/upload", {
				method: "POST",
				headers: { "Content-Type": "application/json", "Accept": "application/json" },
				body: JSON.stringify({
					idempotencyKey: data.get("idempotencyKey"),
					fileName: file.name,
					mimeType,
					sizeBytes: file.size,
					sha256,
				}),
				signal: AbortSignal.timeout(30_000),
			})
			if (!initialized.ok) throw new Error("init")
			const upload = await initialized.json()
			message.textContent = "Subiendo archivo…"
			const sent = await fetch(upload.signedUrl, {
				method: "PUT",
				headers: upload.headers,
				body: file,
				credentials: "omit",
				redirect: "error",
				signal: AbortSignal.timeout(120_000),
			})
			// A retry may find its immutable object already present. The server verifies its bytes.
			if (!sent.ok && sent.status !== 412) throw new Error("storage")
			data.delete("file")
			data.delete("fileUrl")
			data.set("fileName", file.name)
			data.set("mimeType", mimeType)
			data.set("sizeBytes", String(file.size))
			data.set("directUploadSha256", sha256)
			message.textContent = "Confirmando envío…"
			const response = await fetch(action, {
				method: "POST",
				body: data,
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(60_000),
			})
			const result = await response.json()
			if (!response.ok || !result.ok || !result.redirectTo) throw new Error("confirmation")
			const destination = new URL(result.redirectTo, location.href)
			if (destination.origin !== location.origin) throw new Error("redirect")
			location.assign(destination.href)
		} catch (error) {
			const isSizeError = error instanceof Error && error.message === "size"
			if (!isSizeError && file.size <= DOCUMENT_MULTIPART_FALLBACK_LIMIT_BYTES) {
				message.textContent = "La carga directa no está disponible. Intentando el envío estándar…"
				const redirectTo = await submitDocumentMultipartFallback({
					action,
					formData: multipartData,
					fileSizeBytes: file.size,
				})
				if (redirectTo) {
					location.assign(redirectTo)
					return
				}
			}
			message.textContent = isSizeError
				? "Selecciona un archivo de hasta 12 MB."
				: file.size > DOCUMENT_MULTIPART_FALLBACK_LIMIT_BYTES
					? "La carga directa no está disponible para este archivo. Intenta más tarde con el mismo archivo."
					: "No pudimos confirmar el envío. Conservamos los datos; vuelve a intentarlo con el mismo archivo."
			form.removeAttribute("aria-busy")
			controls.forEach((button, index) => {
				button.disabled = disabled[index]
			})
			pending.delete(form)
		}
	},
	true
)
