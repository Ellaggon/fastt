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
				const data = await res.json().catch(() => null)

				if (data.error === "Hotel not found") {
					alert("Este hotel no existe o no está configurado.")
					window.location.href = `/products/${hotelId}/subtype`
				}

				console.error("server error:", data)
				alert("Error al guardar habitación.")
				return
			}

			alert("Habitación guardada")
			window.location.href = "/dashboard"
		} catch (err) {
			console.error(err)
			alert("Error de red")
		}
	})
})
