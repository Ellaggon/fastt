import { dropFiles } from "@/lib/upload/dropFiles"
import { fileState } from "@/lib/upload/fileState"
import { uploadFilesToR2 } from "@/lib/upload/uploadFilesToR2"
import { productFormSchema } from "@/schemas/productFormSchema"

export function initializeProductFormHandlers() {
	document.addEventListener("DOMContentLoaded", () => {
		// dropzone exclusivo para products
		dropFiles("dropZone-product", "imageUpload-product", "imagePreview", "imageText-product")

		const schema = productFormSchema
		const form = document.getElementById("productForm") as HTMLFormElement | null
		if (!form) return

		// Validaciones en tiempo real
		form
			.querySelectorAll<
				HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
			>("input, textarea, select")
			.forEach((field) => {
				field.addEventListener("input", (e) => {
					const input = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
					const name = input.name as keyof typeof schema.shape
					let value: unknown = input.value

					if (name === "basePriceUSD" || name === "basePriceBOB") {
						value = parseFloat(input.value)
					}

					if (name === "imagesMeta" && fileState.uploadFiles) {
						value = Array.from(fileState.uploadFiles).map((file) => ({
							name: file.name,
							size: file.size,
							type: file.type,
						}))
					}

					const partial = { [name]: value }
					const validation = schema.pick({ [name]: true } as any).safeParse(partial)
					const errorElement = form.querySelector(
						`[data-error-for="${name}"]`
					) as HTMLElement | null
					if (errorElement) {
						const errText = validation.success ? "" : validation.error.issues[0]?.message || ""
						errorElement.textContent = errText
					}
				})
			})

		// Submit
		form.addEventListener("submit", async (e) => {
			e.preventDefault()
			console.log("🚀 Enviando form...")
			const fd = new FormData(form)

			// preparar objeto para validar
			const imagesMeta =
				Array.from(fileState.uploadFiles || []).map((f) => ({
					name: f.name,
					size: f.size,
					type: f.type,
				})) || []

			const raw = Object.fromEntries(fd.entries())
			const parsed = {
				providerId: String(raw.providerId || ""),
				name: String(raw.name || ""),
				productType: String(raw.productType || ""),
				shortDescription: String(raw.shortDescription || ""),
				longDescription: String(raw.longDescription || ""),
				departmentId: String(raw.departmentId || ""),
				destinationId: String(raw.destinationId || ""),
				basePriceUSD: Number(raw.basePriceUSD || 0),
				basePriceBOB: Number(raw.basePriceBOB || 0),
				imagesMeta,
			}

			const validation = schema.safeParse(parsed)
			if (!validation.success) {
				// pintar errores
				const errsByField = new Map<string, string>()
				for (const issue of validation.error.issues) {
					const path = issue.path[0] as string
					if (!errsByField.has(path)) errsByField.set(path, issue.message)
				}
				errsByField.forEach((msg, field) => {
					const el = form.querySelector(`[data-error-for="${field}"]`)
					if (el) el.textContent = msg
				})
				return
			}

			// 1) Subir a R2
			const publicUrls =
				fileState.uploadFiles && fileState.uploadFiles.length > 0
					? await uploadFilesToR2(fileState.uploadFiles, "products")
					: []

			if (!publicUrls || publicUrls.length === 0) {
				alert("Error subiendo imágenes. Intenta nuevamente.")
				return
			}

			// 2) Enviar al backend para crear el Product
			fd.append("images", JSON.stringify(publicUrls)) // urls públicas
			try {
				const res = await fetch("/api/products/create", { method: "POST", body: fd })
				if (!res.ok) {
					const t = await res.text()
					console.error("Error creando producto:", t)
					alert("Error creando producto")
					return
				}
				const data = await res.json()

				// Podrías redirigir según el tipo:
				// const type = String(fd.get("productType") || "").toLowerCase()
				window.location.href = `/products/${data.id}/subtype`
			} catch (err) {
				console.error(err)
				alert("Error de red al crear el producto")
			}
		})
	})
}

initializeProductFormHandlers()
