// src/lib/upload/imagePreviewControls.ts
import { fileState } from "./fileState"

/**
 * Renderiza thumbs con: Eliminar, Marcar primaria y reordenar (drag&drop).
 */
export function renderImagePreviewWithControls(containerId: string) {
	const container = document.getElementById(containerId)
	if (!container) return

	const updateFiles = (arr: File[]) => {
		const dt = new DataTransfer()
		arr.forEach((f) => dt.items.add(f))
		fileState.uploadFiles = dt.files
		renderFromFiles()
	}

	const makeBtn = (label: string, extraClasses: string, cb: () => void) => {
		const b = document.createElement("button")
		b.type = "button"
		b.textContent = label
		b.className = `fastt-button inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium ${extraClasses}`
		b.addEventListener("click", (ev) => {
			ev.preventDefault()
			ev.stopPropagation()
			cb()
		})
		return b
	}

	function renderFromFiles() {
		if (container) container.innerHTML = ""
		const files = Array.from(fileState.uploadFiles || [])

		files.forEach((file, idx) => {
			const wrapper = document.createElement("div")
			wrapper.className =
				"image-thumb fastt-row-card relative m-2 bg-white p-2 transition hover:shadow-md"
			wrapper.draggable = true
			wrapper.dataset.idx = String(idx)

			const img = document.createElement("img")
			img.className = "h-28 w-40 rounded-md object-cover"
			const reader = new FileReader()
			reader.onload = () => {
				img.src = reader.result as string
			}
			reader.readAsDataURL(file)

			const btns = document.createElement("div")
			btns.className = "mt-2 flex flex-wrap gap-2"

			btns.appendChild(
				makeBtn(
					"Marcar primaria",
					"border border-emerald-200 bg-emerald-50 text-emerald-800",
					() => {
						const arr = Array.from(files)
						arr.unshift(...arr.splice(idx, 1))
						updateFiles(arr)
					}
				)
			)

			btns.appendChild(
				makeBtn("Eliminar", "border border-red-200 bg-red-50 text-red-700", () => {
					updateFiles(files.filter((_, i) => i !== idx))
				})
			)

			// Drag handlers
			wrapper.addEventListener("dragstart", (e) => {
				e.dataTransfer?.setData("text/plain", String(idx))
				wrapper.classList.add("opacity-50")
			})
			wrapper.addEventListener("dragend", () => wrapper.classList.remove("opacity-50"))
			wrapper.addEventListener("dragover", (e) => e.preventDefault())
			wrapper.addEventListener("drop", (e) => {
				e.preventDefault()
				const from = Number(e.dataTransfer?.getData("text/plain"))
				if (isNaN(from)) return
				const arr = Array.from(files)
				const item = arr.splice(from, 1)[0]
				arr.splice(idx, 0, item)
				updateFiles(arr)
			})

			wrapper.append(img, btns)
			container?.appendChild(wrapper)
		})
	}

	renderFromFiles()
}
