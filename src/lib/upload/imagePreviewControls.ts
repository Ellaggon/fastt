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
		b.className = `text-xs px-2 py-1 rounded ${extraClasses}`
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
			wrapper.className = "image-thumb relative m-2 p-2 rounded bg-gray-800"
			wrapper.draggable = true
			wrapper.dataset.idx = String(idx)

			const img = document.createElement("img")
			img.className = "w-40 h-28 object-cover rounded"
			const reader = new FileReader()
			reader.onload = () => {
				img.src = reader.result as string
			}
			reader.readAsDataURL(file)

			const btns = document.createElement("div")
			btns.className = "mt-2 flex gap-2"

			btns.appendChild(
				makeBtn("Marcar primaria", "bg-green-600", () => {
					const arr = Array.from(files)
					arr.unshift(...arr.splice(idx, 1))
					updateFiles(arr)
				})
			)

			btns.appendChild(
				makeBtn("Eliminar", "bg-red-600", () => {
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
