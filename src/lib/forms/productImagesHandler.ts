import { setPlaybookSubmitBusy } from "@/lib/forms/playbookFormBusy"
import {
	readPlaybookNavIntent,
	resolvePlaybookRedirectAfterSave,
} from "@/lib/playbook/playbook-nav"

function qs<T extends Element>(sel: string, el: ParentNode = document) {
	return el.querySelector(sel) as T | null
}

type UploadState = "pending" | "queued" | "uploading" | "success" | "error"

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

function initProductImagesForm() {
	const form = qs<HTMLFormElement>("#imagesForm")
	const btn = qs<HTMLButtonElement>("#submitBtn")
	const filesInput = qs<HTMLInputElement>("#files")
	const dropzone = qs<HTMLDivElement>("#dropzone")
	const previewGrid = qs<HTMLDivElement>("#previewGrid")
	const imageCount = qs<HTMLElement>("#imageCount")
	const stateLabel = qs<HTMLElement>("#stateLabel")
	const stateDetail = qs<HTMLElement>("#stateDetail")

	if (!form || !btn || !filesInput || !dropzone || !previewGrid || !stateLabel || !stateDetail)
		return
	if (form.dataset.bound === "true") return
	form.dataset.bound = "true"

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
	const requiredImageCount = Number(form.dataset.requiredImageCount ?? 0)
	const continueButton = document.querySelector<HTMLButtonElement>(
		'button[form="imagesForm"][name="playbookNav"][value="continue"]'
	)

	function syncPublicationRequirement() {
		const total =
			existingImages.length + pendingImages.filter((item) => item.state !== "error").length
		const missing = Math.max(0, requiredImageCount - total)
		if (continueButton && form.dataset.uploading !== "true") {
			continueButton.disabled = missing > 0
			continueButton.title =
				missing > 0 ? `Agrega ${missing} foto${missing === 1 ? "" : "s"} más para continuar.` : ""
		}
		if (imageCount) {
			imageCount.textContent = `${total}/5 fotos ${requiredImageCount > 0 ? "necesarias para publicar" : "recomendadas"}`
		}
		return { total, missing }
	}

	function setState(
		state: "empty" | "incomplete" | "loading" | "success" | "error" | "disabled",
		detail = ""
	) {
		const labels: Record<string, string> = {
			empty: "Vacío: selecciona imágenes para continuar.",
			incomplete: "Pendiente: completa la galería para continuar.",
			loading: "Subiendo fotografías. Espera a que termine antes de volver a pulsar.",
			success: "Éxito: imágenes asociadas correctamente.",
			error: "Error: no se pudieron asociar las imágenes.",
			disabled: "Subiendo fotografías. Espera a que termine antes de volver a pulsar.",
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
		previewGridEl.setAttribute(
			"aria-busy",
			pendingImages.some((item) => item.state === "uploading" || item.state === "queued")
				? "true"
				: "false"
		)
		syncPublicationRequirement()
		if (pendingImages.length === 0 && existingImages.length === 0) {
			previewGridEl.innerHTML =
				'<p class="fastt-empty-state col-span-full p-6 text-sm text-slate-600">Todavía no hay imágenes cargadas.</p>'
			return
		}

		for (const image of existingImages) {
			const card = document.createElement("div")
			card.className = "fastt-row-card space-y-2 bg-white p-3"
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
			card.className = "fastt-row-card space-y-2 bg-white p-3"
			const stateText =
				image.state === "pending"
					? "Pendiente"
					: image.state === "queued"
						? "En cola"
						: image.state === "uploading"
							? "Subiendo..."
							: image.state === "success"
								? "Cargada"
								: "Error"

			card.innerHTML = `
				<div class="relative">
					<img src="${image.previewUrl}" alt="Vista previa" class="h-24 w-full rounded-md object-cover ${
						image.state === "uploading" ? "opacity-40" : ""
					}" />
					${
						image.state === "uploading"
							? `<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-slate-950/55 text-white">
									<span class="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true"></span>
									<span class="text-xs font-semibold">Subiendo...</span>
								</div>`
							: image.state === "queued"
								? `<div class="absolute inset-0 flex items-center justify-center rounded-md bg-slate-950/40 text-xs font-semibold text-white">En cola</div>`
								: ""
					}
				</div>
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
				"fastt-button inline-flex h-8 w-full items-center justify-center rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
			removeBtn.textContent = "Quitar"
			removeBtn.disabled = image.state === "uploading" || image.state === "queued"
			removeBtn.addEventListener("click", () => {
				const index = pendingImages.findIndex((item) => item.id === image.id)
				if (index >= 0) {
					URL.revokeObjectURL(pendingImages[index].previewUrl)
					pendingImages.splice(index, 1)
					syncInputWithPendingImages()
					renderPreviewGrid()
					if (pendingImages.length === 0) {
						const requirement = syncPublicationRequirement()
						setState(
							requirement.missing > 0 ? "incomplete" : "empty",
							requirement.missing > 0
								? `Faltan ${requirement.missing} foto${requirement.missing === 1 ? "" : "s"}.`
								: ""
						)
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
			const requirement = syncPublicationRequirement()
			setState(
				requirement.missing > 0 ? "incomplete" : "empty",
				requirement.missing > 0
					? `${pendingImages.length} imagen(es) listas para subir. Faltan ${requirement.missing}.`
					: `${pendingImages.length} imagen(es) listas para subir. Ya puedes continuar.`
			)
		}
	}

	dropzoneEl.addEventListener("click", () => fileInputEl.click())
	dropzoneEl.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return
		event.preventDefault()
		fileInputEl.click()
	})
	dropzoneEl.addEventListener("dragover", (event) => {
		event.preventDefault()
		dropzoneEl.classList.remove("border-slate-300", "bg-white")
		dropzoneEl.classList.add("border-slate-950", "bg-slate-50", "ring-2", "ring-slate-950/10")
	})
	dropzoneEl.addEventListener("dragleave", () => {
		dropzoneEl.classList.remove("border-slate-950", "bg-slate-50", "ring-2", "ring-slate-950/10")
		dropzoneEl.classList.add("border-slate-300", "bg-white")
	})
	dropzoneEl.addEventListener("drop", (event) => {
		event.preventDefault()
		dropzoneEl.classList.remove("border-slate-950", "bg-slate-50", "ring-2", "ring-slate-950/10")
		dropzoneEl.classList.add("border-slate-300", "bg-white")
		if (!event.dataTransfer?.files?.length) return
		addFiles(event.dataTransfer.files)
	})

	fileInputEl.addEventListener("change", () => {
		if (!fileInputEl.files?.length) return
		addFiles(fileInputEl.files)
	})

	renderPreviewGrid()
	const initialRequirement = syncPublicationRequirement()
	if (initialRequirement.missing > 0) {
		setState(
			"incomplete",
			`Faltan ${initialRequirement.missing} foto${initialRequirement.missing === 1 ? "" : "s"} para continuar con la preparación.`
		)
	} else if (existingImages.length > 0) {
		setState(
			"empty",
			`Ya tienes ${existingImages.length} foto(s). Puedes continuar o agregar nuevas.`
		)
	}

	function redirectAfterSuccess(
		formFd: FormData,
		productId: string,
		submitter?: EventTarget | null
	) {
		window.location.href = resolvePlaybookRedirectAfterSave(formFd, {
			productId,
			launchPath: `/product/${encodeURIComponent(productId)}/subtype`,
			launchStep: "subtype",
			submitter,
		})
	}

	const releaseUpload = () => {
		form.dataset.uploading = "false"
		setPlaybookSubmitBusy(form, false)
		syncPublicationRequirement()
	}

	form.addEventListener("submit", async (e) => {
		e.preventDefault()
		if (form.dataset.uploading === "true") return
		const formFd = new FormData(form)
		const productId = String(formFd.get("productId") || "")
		const intent = readPlaybookNavIntent(formFd, e.submitter)
		const requirement = syncPublicationRequirement()
		if (intent === "continue" && requirement.missing > 0) {
			setState(
				"incomplete",
				`Agrega ${requirement.missing} foto${requirement.missing === 1 ? "" : "s"} más antes de continuar.`
			)
			dropzoneEl.focus()
			return
		}
		form.dataset.uploading = "true"
		const queue = pendingImages.filter((item) => item.state !== "error" && item.state !== "success")
		const busyLabel = queue.length > 0 ? `Subiendo 1 de ${queue.length}…` : "Continuando…"
		setPlaybookSubmitBusy(form, true, busyLabel)
		setState("loading", busyLabel)

		try {
			if (pendingImages.length === 0) {
				if (existingImages.length > 0) {
					setState("success", "Continuando con las fotos existentes.")
					redirectAfterSuccess(formFd, productId, e.submitter)
					return
				}
				if (intent === "exit") {
					redirectAfterSuccess(formFd, productId, e.submitter)
					return
				}
				releaseUpload()
				setState("empty", "Debes seleccionar al menos una imagen.")
				dropzoneEl.focus()
				return
			}

			for (const item of queue) item.state = "queued"
			renderPreviewGrid()

			const imageIds: string[] = []
			let uploaded = 0

			for (const item of pendingImages) {
				if (item.state === "error" || item.state === "success") continue
				uploaded += 1
				item.state = "uploading"
				item.error = ""
				const progressLabel = `Subiendo ${uploaded} de ${queue.length}…`
				setPlaybookSubmitBusy(form, true, progressLabel)
				setState("loading", progressLabel)
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
					releaseUpload()
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
					releaseUpload()
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
					releaseUpload()
					setState("error", `Error al completar carga (${completeRes.status}):\n${completeTxt}`)
					return
				}

				item.state = "success"
				renderPreviewGrid()
				imageIds.push(initJson.imageId)
			}

			setPlaybookSubmitBusy(form, true, "Guardando galería…")
			setState("loading", "Guardando galería…")

			const setFd = new FormData()
			setFd.set("productId", productId)
			const galleryIds = [...existingImages.map((image) => image.id), ...imageIds].filter(Boolean)
			for (const id of [...new Set(galleryIds)]) setFd.append("imageId", id)

			const res = await fetch("/api/product/images", { method: "POST", body: setFd })
			const txt = await res.text()
			if (!res.ok) {
				releaseUpload()
				setState("error", `status=${res.status}\n${txt}`)
				return
			}

			setState("success", "Guardado correctamente")
			redirectAfterSuccess(formFd, productId, e.submitter)
		} catch (err) {
			releaseUpload()
			setState("error", `Error de red: ${String(err)}`)
		}
	})
}

initProductImagesForm()
document.addEventListener("astro:page-load", initProductImagesForm)
