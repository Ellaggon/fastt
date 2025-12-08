import { uploadFilesToR2 } from "@/lib/upload/uploadFilesToR2"

document.addEventListener("DOMContentLoaded", () => {
	const form = document.getElementById("editRoomForm") as HTMLFormElement | null
	if (!form) return

	form.addEventListener("submit", async (e) => {
		e.preventDefault()

		const fd = new FormData(form)

		const existingRaw = fd.get("existingImages") as string
		const existingImages: string[] = existingRaw ? JSON.parse(existingRaw) : []

		const fileInput = document.getElementById("roomImages") as HTMLInputElement | null
		let newImages: string[] = []
		// let urls: string[] = []

		if (fileInput?.files?.length) {
			newImages = await uploadFilesToR2(fileInput.files, "hotel-room")
		}

		const finalImages = [...existingImages, ...newImages]

		// if (fileInput && fileInput.files && fileInput.files?.length > 0) {
		// 	try {
		// 		urls = await uploadFilesToR2(fileInput.files, "hotel-room")
		// 	} catch (uploadError) {
		// 		console.error("Error al subir archivos:", uploadError)
		// 		return
		// 	}
		// }

		fd.append("images", JSON.stringify(finalImages))

		const hotelId = fd.get("hotelId")

		const res = await fetch(`/api/products/${hotelId}/rooms/update`, {
			method: "POST",
			body: fd,
		})

		if (!res.ok) {
			const txt = await res.text()
			console.error("Error de actualización de habitación:", txt)
			// Aquí deberías mostrar un mensaje en el UI en lugar de alert
			return
		}

		// Aquí deberías mostrar un mensaje de éxito en el UI en lugar de alert
		console.log("Habitación actualizada correctamente")
		window.location.href = "/dashboard"
	})
})

document.getElementById("deleteRoomBtn")?.addEventListener("click", async () => {
	const hotelRoomId = (document.querySelector("input[name='hotelRoomId']") as HTMLInputElement)
		?.value
	const hotelId = (document.querySelector("input[name='hotelId']") as HTMLInputElement)?.value

	if (!hotelRoomId || !hotelId) {
		alert("Faltan IDs requeridos.")
		return
	}

	const ok = confirm(
		"¿Seguro que deseas eliminar esta habitación? Esta acción no se puede deshacer."
	)
	if (!ok) return

	const res = await fetch(`/api/products/${hotelId}/rooms/delete`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ hotelRoomId }),
	})

	const data = await res.json()

	if (!res.ok) {
		alert(data.error || "No se pudo eliminar la habitación.")
		return
	}

	alert("Habitación eliminada correctamente.")
	window.location.href = "/dashboard"
})
