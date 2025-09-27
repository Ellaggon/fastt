import { fileState } from "./fileState"
import { renderImagePreviewWithControls } from "./imagePreviewControls"

const $ = (el: string) => document.getElementById(el) as HTMLElement | null

export function dropFiles(
	dropZone: string,
	imageUpload: string,
	imagePreview: string,
	imageText: string
) {
	const $dropZone = $(dropZone)
	const $imageUpload = $(imageUpload) as HTMLInputElement
	const $imagePreview = $(imagePreview)
	const $imageText = $(imageText)

	if ($dropZone && $imageUpload && $imagePreview) {
		$dropZone.addEventListener("click", (e) => {
			const target = e.target as HTMLElement
			if (target !== $dropZone) return
			$imageUpload?.click()
		})
		$dropZone.addEventListener("change", (e) => {
			const target = e.target as HTMLInputElement
			const newFiles = target?.files ? Array.from(target.files) : []

			const currentFiles = fileState.uploadFiles ? Array.from(fileState.uploadFiles) : []
			const dt = new DataTransfer()

			;[...currentFiles, ...newFiles].forEach((f) => dt.items.add(f))

			fileState.uploadFiles = dt.files

			$imageText?.classList.add("hidden")
			renderImagePreviewWithControls(imagePreview)
			console.log("change files merged: ", fileState.uploadFiles)
		})
		// drop, dragover & dragleave
		$dropZone.addEventListener("dragover", (e) => {
			e.preventDefault()
			$dropZone.classList.remove("border-gray-700")
			$dropZone.classList.add("border-blue-500")
		})
		$dropZone.addEventListener("dragleave", () => {
			$dropZone.classList.remove("border-blue-500")
			$dropZone.classList.add("border-gray-700")
		})
		$dropZone.addEventListener("drop", (e) => {
			e.preventDefault()
			const dataTransfer = e.dataTransfer
			if (!dataTransfer) return
			const newFiles = Array.from(dataTransfer.files)
			const currentFiles = fileState.uploadFiles ? Array.from(fileState.uploadFiles) : []

			const dt = new DataTransfer()
			;[...currentFiles, ...newFiles].forEach((f) => dt.items.add(f))

			fileState.uploadFiles = dt.files

			console.log("uploadFile desde el drop (merged):", fileState.uploadFiles)
			$imageText?.classList.add("hidden")
			renderImagePreviewWithControls(imagePreview)
		})
	}
}
