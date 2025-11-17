// src/lib/forms/roomFormHandler.js
import { uploadFilesToR2 } from "@/lib/upload/uploadFilesToR2"

document.addEventListener("DOMContentLoaded", () => {
	const form = document.getElementById("hotelRoomTypeForm") as HTMLFormElement
	if (!form) return

	form.addEventListener("submit", async (e) => {
		e.preventDefault()
		const fd = new FormData(form)

		// 1) si hay files -> subir a R2 primero
		const fileInput = document.getElementById("roomImages") as HTMLInputElement | null
		let publicUrls: string[] = []

		if (fileInput && fileInput.files && fileInput.files.length > 0) {
			publicUrls = await uploadFilesToR2(fileInput.files, "hotel-room")

			if (publicUrls.length === 0) {
				alert("Error subiendo imágenes")
				return
			}
		}

		// agregar URLs como JSON
		fd.append("images", JSON.stringify(publicUrls))

		// Para checkboxes amenities, FormData ya trae multiples con key 'amenities'
		try {
			const hotelId = fd.get("hotelId")
			const res = await fetch(`/api/products/${hotelId}/rooms/create`, {
				method: "POST",
				body: fd,
			})

			if (!res.ok) {
				const txt = await res.text()
				console.error("server error:", txt)
				alert("Error al guardar habitación: " + txt)
				return
			}

			alert("Habitación guardada")
			window.location.reload()
		} catch (err) {
			console.error(err)
			alert("Error de red")
		}
	})
})
