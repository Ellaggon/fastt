// src/lib/forms/imageFormHandler.ts
import { uploadFilesToR2 } from "@/lib/upload/uploadFilesToR2"

/**
 * imageFormHandler
 * Maneja edición de imágenes: añadir, reordenar (drag), marcar principal, eliminar y guardar (subir nuevos + notificar backend).
 *
 * Requisitos DOM (los IDs deben existir en la página):
 * - #dropZone-product
 * - #imageUpload-product (input type=file multiple)
 * - #imagePreview (contenedor)
 * - #pickBtn
 * - #saveBtn
 * - #cancelBtn
 * - #initialImages (script[type="application/json"] con JSON de images desde el servidor)
 * - #productId (input hidden) OR el handler intentará extraer el id de la URL como fallback
 *
 * El endpoint esperado: POST /api/products/images/update
 * Body: { productId: string, images: [{ id?: string, url: string, isPrimary?: boolean }] }
 */

type Item = {
	type: "existing" | "new"
	id?: string // present for existing rows
	url: string // public url or blob url for preview
	file?: File // only for new items
	isPrimary?: boolean
}
;(() => {
	// helpers DOM
	const $ = (id: string) => document.getElementById(id)

	const dropZone = $("dropZone-product") as HTMLElement | null
	const fileInput = $("imageUpload-product") as HTMLInputElement | null
	const preview = $("imagePreview") as HTMLElement | null
	const pickBtn = $("pickBtn") as HTMLButtonElement | null
	const saveBtn = $("saveBtn") as HTMLButtonElement | null
	const cancelBtn = $("cancelBtn") as HTMLButtonElement | null
	const productIdInput = $("productId") as HTMLInputElement | null
	const initialScript = $("initialImages") as HTMLScriptElement | null

	if (!preview) {
		console.error("imageFormHandler: #imagePreview not found")
		return
	}

	// Parse initial images provided by server
	let initialImages: any[] = []
	if (initialScript) {
		try {
			// textContent ahora tendrá el JSON crudo (porque usamos set:html)
			initialImages = JSON.parse(initialScript.textContent || "[]")
		} catch (err) {
			console.error("imageFormHandler: error parsing initialImages JSON", err)
			initialImages = []
		}
	}

	// Build initial items list (existing images)
	const items: Item[] = initialImages.map((img) => ({
		type: "existing",
		id: img.id,
		url: img.url,
		isPrimary: !!img.isPrimary,
	}))

	// If no primary flagged, mark first as primary
	if (!items.some((i) => i.isPrimary) && items.length > 0) items[0].isPrimary = true

	// Utility: render the preview grid based on items[]
	function render() {
		if (!preview) return
		preview.innerHTML = ""
		items.forEach((it, idx) => {
			const card = document.createElement("div")
			card.className = "image-card bg-neutral-200 p-2 rounded-lg flex flex-col"
			card.draggable = true
			card.dataset.idx = String(idx)

			const img = document.createElement("img")
			img.src = it.url
			img.alt = `Imagen ${idx + 1}`
			img.className = "w-full h-40 object-cover rounded mb-2"

			// Controls (left/right, primary radio, delete)
			const controls = document.createElement("div")
			controls.className = "flex items-center justify-between gap-2"

			// left/right group
			const moves = document.createElement("div")
			moves.className = "flex gap-1"

			const btnLeft = document.createElement("button")
			btnLeft.type = "button"
			btnLeft.className = "px-2 py-1 bg-black rounded"
			btnLeft.title = "Mover izquierda"
			btnLeft.textContent = "←"
			btnLeft.addEventListener("click", (e) => {
				e.preventDefault()
				if (idx <= 0) return
				swap(idx, idx - 1)
			})

			const btnRight = document.createElement("button")
			btnRight.type = "button"
			btnRight.className = "px-2 py-1 bg-black rounded"
			btnRight.title = "Mover derecha"
			btnRight.textContent = "→"
			btnRight.addEventListener("click", (e) => {
				e.preventDefault()
				if (idx >= items.length - 1) return
				swap(idx, idx + 1)
			})

			moves.appendChild(btnLeft)
			moves.appendChild(btnRight)

			// actions: primary + delete
			const actions = document.createElement("div")
			actions.className = "flex items-center gap-2"

			const primaryLabel = document.createElement("label")
			primaryLabel.className = "flex items-center gap-1 text-sm text-neutral-900"
			const primaryRadio = document.createElement("input")
			primaryRadio.type = "radio"
			primaryRadio.name = "primarySelector"
			primaryRadio.checked = !!it.isPrimary
			primaryRadio.addEventListener("change", () => setPrimary(idx))
			primaryLabel.appendChild(primaryRadio)
			primaryLabel.appendChild(document.createTextNode("Principal"))

			const delBtn = document.createElement("button")
			delBtn.type = "button"
			delBtn.className = "px-2 py-1 bg-red-700 rounded text-sm"
			delBtn.textContent = "Eliminar"
			delBtn.addEventListener("click", (e) => {
				e.preventDefault()
				removeAt(idx)
			})

			actions.appendChild(primaryLabel)
			actions.appendChild(delBtn)

			controls.appendChild(moves)
			controls.appendChild(actions)

			// Drag events
			card.addEventListener("dragstart", (ev) => {
				ev.dataTransfer?.setData("text/plain", String(idx))
				card.classList.add("opacity-50")
			})
			card.addEventListener("dragend", () => card.classList.remove("opacity-50"))
			card.addEventListener("dragover", (ev) => ev.preventDefault())
			card.addEventListener("drop", (ev) => {
				ev.preventDefault()
				const from = Number(ev.dataTransfer?.getData("text/plain"))
				if (Number.isNaN(from)) return
				const arr = items.splice(from, 1)
				items.splice(idx, 0, arr[0])
				render()
			})

			card.appendChild(img)
			card.appendChild(controls)
			preview?.appendChild(card)
		})
	}

	// Swap helper
	function swap(a: number, b: number) {
		const tmp = items[a]
		items[a] = items[b]
		items[b] = tmp
		render()
	}

	// Remove helper
	function removeAt(index: number) {
		const it = items[index]
		// if new file with blob url -> revoke
		if (it.type === "new" && it.url?.startsWith("blob:")) {
			try {
				URL.revokeObjectURL(it.url)
			} catch (e) {}
		}
		items.splice(index, 1)
		// ensure someone is primary
		if (!items.some((i) => i.isPrimary) && items.length > 0) items[0].isPrimary = true
		render()
	}

	// Set single primary
	function setPrimary(index: number) {
		for (let i = 0; i < items.length; i++) items[i].isPrimary = i === index
		render()
	}

	// Add new files (File[])
	function addFiles(files: File[]) {
		for (const f of files) {
			const blob = URL.createObjectURL(f)
			items.push({
				type: "new",
				file: f,
				url: blob,
				isPrimary: false,
			})
		}
		// If no primary -> first becomes primary
		if (!items.some((i) => i.isPrimary) && items.length > 0) items[0].isPrimary = true
		render()
	}

	// Initialize UI
	render()

	// File input handler
	if (fileInput) {
		fileInput.addEventListener("change", (ev) => {
			const files = Array.from(fileInput.files || [])
			if (files.length > 0) addFiles(files)
			// reset input so same file can be chosen later
			fileInput.value = ""
		})
	}

	// Pick button triggers file input
	if (pickBtn && fileInput) {
		pickBtn.addEventListener("click", (ev) => {
			ev.preventDefault()
			fileInput.click()
		})
	}

	// Drop zone handlers (supports dragging files into the zone)
	if (dropZone) {
		dropZone.addEventListener("dragover", (ev) => {
			ev.preventDefault()
			dropZone.classList.add("border-blue-500")
		})
		dropZone.addEventListener("dragleave", () => {
			dropZone.classList.remove("border-blue-500")
		})
		dropZone.addEventListener("drop", (ev) => {
			ev.preventDefault()
			dropZone.classList.remove("border-blue-500")
			const dt = ev.dataTransfer
			if (!dt) return
			const files = Array.from(dt.files || [])
			if (files.length > 0) addFiles(files)
		})
	}

	// Get productId: prefer hidden input, otherwise try path fallback
	function getProductId(): string | null {
		const v = productIdInput?.getAttribute("value") || productIdInput?.value
		if (v) return v
		// fallback: try to extract last path segment
		try {
			const parts = location.pathname.split("/").filter(Boolean)
			return parts[parts.length - 1] || null
		} catch (e) {
			return null
		}
	}

	// Save handler
	if (saveBtn) {
		saveBtn.addEventListener("click", async (ev) => {
			ev.preventDefault()
			const pid = getProductId()
			if (!pid) {
				alert("Product ID missing")
				return
			}
			saveBtn.disabled = true
			const oldText = saveBtn.textContent
			saveBtn.textContent = "Guardando..."

			try {
				// Ensure there's a primary
				if (!items.some((i) => i.isPrimary) && items.length > 0) items[0].isPrimary = true

				// Collect new files in the order they appear
				const newFiles = items.filter((i) => i.type === "new").map((i) => i.file!) as File[]

				let publicUrls: string[] = []
				if (newFiles.length > 0) {
					// upload in the same order
					const dt = new DataTransfer()
					newFiles.forEach((f) => dt.items.add(f))
					publicUrls = await uploadFilesToR2(dt.files, "products")
					if (!publicUrls || publicUrls.length !== newFiles.length) {
						console.warn("uploadFilesToR2 returned unexpected result", publicUrls)
						// we continue but likely error
					}
				}

				// Build payload images in final order:
				let newPointer = 0
				const payloadImgs = items.map((it) => {
					if (it.type === "existing") {
						return { id: it.id, url: it.url, isPrimary: !!it.isPrimary }
					} else {
						const url = publicUrls[newPointer++]
						return { url, isPrimary: !!it.isPrimary }
					}
				})

				// POST to server
				const res = await fetch("/api/products/images/update", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ productId: pid, images: payloadImgs }),
				})

				const result = await res.json().catch(() => ({}))
				if (!res.ok) {
					console.error("images update failed:", result)
					alert("Error guardando imágenes: " + (result?.error || res.statusText))
					saveBtn.disabled = false
					saveBtn.textContent = oldText as string
					return
				}

				// success: reload to fetch canonical DB state (or you could patch UI from result)
				setTimeout(() => {
					window.location.href = `/dashboard`
				}, 600)
			} catch (err) {
				console.error("Save images error:", err)
				alert("Error guardando imágenes. Revisa la consola.")
				saveBtn.disabled = false
				saveBtn.textContent = oldText as string
			}
		})
	}

	// Cancel handler: just reload
	if (cancelBtn) {
		cancelBtn.addEventListener("click", (ev) => {
			ev.preventDefault()
			setTimeout(() => {
				window.location.href = `/dashboard`
			}, 600)
		})
	}
})()
