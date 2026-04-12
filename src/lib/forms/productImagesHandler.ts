function qs<T extends Element>(sel: string, el: ParentNode = document) {
	return el.querySelector(sel) as T | null
}

type UploadState = "pending" | "uploading" | "success" | "error"

type PendingImage = {
	id: string
	file: File
	previewUrl: string
	state: UploadState
	error?: string
}

type ExistingImage = {
	id: string
	url: string
	isPrimary?: boolean
	order?: number
}

document.addEventListener("DOMContentLoaded", () => {
	const form = qs<HTMLFormElement>("#imagesForm")
	const btn = qs<HTMLButtonElement>("#submitBtn")
	const filesInput = qs<HTMLInputElement>("#files")
	const dropzone = qs<HTMLDivElement>("#dropzone")
	const previewGrid = qs<HTMLDivElement>("#previewGrid")
	const stateLabel = qs<HTMLElement>("#stateLabel")
	const stateDetail = qs<HTMLElement>("#stateDetail")

	if (!form || !btn || !filesInput || !dropzone || !previewGrid || !stateLabel || !stateDetail)
		return

	const pendingImages: PendingImage[] = []
	const existingImagesData = qs<HTMLScriptElement>("#existingImagesData")
	const existingImages: ExistingImage[] = (() => {
		if (!existingImagesData?.textContent) return []
		try {
			const parsed = JSON.parse(existingImagesData.textContent)
			return Array.isArray(parsed) ? parsed : []
		} catch (error) {
			console.error("[product-images] existingImagesData parse error", error)
			return []
		}
	})()

	console.log("[product-images] existingImages (client)", existingImages)
	const fileInputEl = filesInput
	const dropzoneEl = dropzone
	const previewGridEl = previewGrid
	const stateLabelEl = stateLabel
	const stateDetailEl = stateDetail

	function setState(state: "empty" | "loading" | "success" | "error" | "disabled", detail = "") {
		const labels: Record<string, string> = {
			empty: "Vacío: selecciona imágenes para continuar.",
			loading: "Cargando: procesando imágenes...",
			success: "Éxito: imágenes asociadas correctamente.",
			error: "Error: no se pudieron asociar las imágenes.",
			disabled: "Deshabilitado: esperando respuesta del servidor.",
		}
		stateLabelEl.textContent = labels[state] || labels.empty
		stateDetailEl.textContent = detail
	}

	function syncInputWithPendingImages() {
		const dt = new DataTransfer()
		for (const item of pendingImages) {
			if (item.state !== "error") dt.items.add(item.file)
		}
		fileInputEl.files = dt.files
	}

	function renderPreviewGrid() {
		previewGridEl.innerHTML = ""
		if (pendingImages.length === 0 && existingImages.length === 0) {
			previewGridEl.innerHTML =
				'<p class="col-span-full rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Todavía no hay imágenes cargadas.</p>'
			return
		}

		for (const image of existingImages) {
			const card = document.createElement("div")
			card.className = "space-y-2 rounded-lg border border-slate-200 bg-white p-3"
			card.innerHTML = `
				<img src="${image.url}" alt="Imagen existente" class="h-24 w-full rounded-md object-cover" />
				<div class="space-y-1">
					<p class="truncate text-xs font-medium text-slate-700">Imagen existente</p>
					<p class="text-xs text-slate-500">${image.isPrimary ? "Principal" : "Existente"}</p>
				</div>
			`
			previewGridEl.appendChild(card)
		}

		for (const image of pendingImages) {
			const card = document.createElement("div")
			card.className = "space-y-2 rounded-lg border border-slate-200 bg-white p-3"
			const stateText =
				image.state === "pending"
					? "Pendiente"
					: image.state === "uploading"
						? "Subiendo..."
						: image.state === "success"
							? "Cargada"
							: "Error"

			card.innerHTML = `
				<img src="${image.previewUrl}" alt="Vista previa" class="h-24 w-full rounded-md object-cover" />
				<div class="space-y-1">
					<p class="truncate text-xs font-medium text-slate-700">${image.file.name}</p>
					<p class="text-xs ${
						image.state === "error"
							? "text-red-600"
							: image.state === "success"
								? "text-green-600"
								: "text-slate-500"
					}">${stateText}</p>
					${image.error ? `<p class="text-xs text-red-600">${image.error}</p>` : ""}
				</div>
			`

			const removeBtn = document.createElement("button")
			removeBtn.type = "button"
			removeBtn.className =
				"inline-flex h-8 w-full items-center justify-center rounded-md border border-slate-300 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100"
			removeBtn.textContent = "Quitar"
			removeBtn.disabled = image.state === "uploading"
			removeBtn.addEventListener("click", () => {
				const index = pendingImages.findIndex((item) => item.id === image.id)
				if (index >= 0) {
					URL.revokeObjectURL(pendingImages[index].previewUrl)
					pendingImages.splice(index, 1)
					syncInputWithPendingImages()
					renderPreviewGrid()
					if (pendingImages.length === 0) {
						setState("empty")
					}
				}
			})
			card.appendChild(removeBtn)
			previewGridEl.appendChild(card)
		}
	}

	function addFiles(files: FileList | File[]) {
		for (const file of Array.from(files)) {
			if (!file.type.startsWith("image/")) continue
			pendingImages.push({
				id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
				file,
				previewUrl: URL.createObjectURL(file),
				state: "pending",
			})
		}
		syncInputWithPendingImages()
		renderPreviewGrid()
		if (pendingImages.length > 0) {
			setState("empty", `${pendingImages.length} imagen(es) listas para subir.`)
		}
	}

	dropzoneEl.addEventListener("click", () => fileInputEl.click())
	dropzoneEl.addEventListener("dragover", (event) => {
		event.preventDefault()
		dropzoneEl.classList.add("border-blue-500", "bg-blue-50")
	})
	dropzoneEl.addEventListener("dragleave", () => {
		dropzoneEl.classList.remove("border-blue-500", "bg-blue-50")
	})
	dropzoneEl.addEventListener("drop", (event) => {
		event.preventDefault()
		dropzoneEl.classList.remove("border-blue-500", "bg-blue-50")
		if (!event.dataTransfer?.files?.length) return
		addFiles(event.dataTransfer.files)
	})

	fileInputEl.addEventListener("change", () => {
		if (!fileInputEl.files?.length) return
		addFiles(fileInputEl.files)
	})

	renderPreviewGrid()
	if (existingImages.length > 0) {
		setState(
			"empty",
			`Imágenes existentes: ${existingImages.length}. Puedes agregar nuevas imágenes.`
		)
	}

	form.addEventListener("submit", async (e) => {
		e.preventDefault()
		setState("loading")
		btn.disabled = true
		setState("disabled")

		try {
			if (pendingImages.length === 0) {
				btn.disabled = false
				setState("empty", "Debes seleccionar al menos una imagen.")
				return
			}

			const productId = String(new FormData(form).get("productId") || "")
			const imageIds: string[] = []

			for (const item of pendingImages) {
				item.state = "uploading"
				item.error = ""
				renderPreviewGrid()

				const initFd = new FormData()
				initFd.set("productId", productId)
				initFd.set("file", item.file)

				const initRes = await fetch("/api/uploads/init", { method: "POST", body: initFd })
				const initTxt = await initRes.text()
				if (!initRes.ok) {
					item.state = "error"
					item.error = `Inicialización fallida (${initRes.status})`
					renderPreviewGrid()
					btn.disabled = false
					setState("error", `Error de inicialización (${initRes.status}):\n${initTxt}`)
					return
				}

				const initJson = JSON.parse(initTxt) as {
					imageId: string
					objectKey: string
					signedUrl: string
				}

				const putRes = await fetch(initJson.signedUrl, {
					method: "PUT",
					body: item.file,
					headers: { "Content-Type": item.file.type },
				})
				if (!putRes.ok) {
					item.state = "error"
					item.error = `Carga fallida (${putRes.status})`
					renderPreviewGrid()
					btn.disabled = false
					setState("error", `Error de carga al storage (${putRes.status}).`)
					return
				}

				const completeFd = new FormData()
				completeFd.set("productId", productId)
				completeFd.set("imageId", initJson.imageId)
				completeFd.set("objectKey", initJson.objectKey)

				const completeRes = await fetch("/api/uploads/complete", {
					method: "POST",
					body: completeFd,
				})
				const completeTxt = await completeRes.text()
				if (!completeRes.ok) {
					item.state = "error"
					item.error = `Finalización fallida (${completeRes.status})`
					renderPreviewGrid()
					btn.disabled = false
					setState("error", `Error al completar carga (${completeRes.status}):\n${completeTxt}`)
					return
				}

				item.state = "success"
				renderPreviewGrid()
				imageIds.push(initJson.imageId)
			}

			const setFd = new FormData()
			setFd.set("productId", productId)
			for (const id of imageIds) setFd.append("imageId", id)

			const res = await fetch("/api/product/images", { method: "POST", body: setFd })
			const txt = await res.text()
			if (!res.ok) {
				btn.disabled = false
				setState("error", `status=${res.status}\n${txt}`)
				return
			}

			const mode = String(new FormData(form).get("flow") || "")
				.trim()
				.toLowerCase()
			setState("success", "Guardado correctamente")
			if (mode === "create") {
				window.location.href = `/product/${encodeURIComponent(productId)}/subtype?flow=create`
				return
			}
			window.location.href = `/product/${encodeURIComponent(productId)}`
		} catch (err) {
			btn.disabled = false
			setState("error", `Error de red: ${String(err)}`)
		}
	})
})
