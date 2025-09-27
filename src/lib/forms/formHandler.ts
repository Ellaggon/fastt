export function initializeFormHandler() {
	document.addEventListener("DOMContentLoaded", () => {
		const forms = document.querySelectorAll("form[data-form-type]")
		if (forms.length === 0) return

		forms.forEach((form) => {
			form.addEventListener("submit", (e) => {
				e.preventDefault()
				const formType = form.getAttribute("data-form-type")

				// Lógica para manejar cada tipo de formulario
				switch (formType) {
					case "provider":
						handleProviderForm(e)
						break
					case "hotelRoomType":
						handleHotelRoomsTypeForm(e)
						break
					default:
						console.error("Tipo de formulario no reconocido.")
				}
			})
		})
	})
}

// Función específica para manejar el formulario del proveedor
async function handleProviderForm(e: Event) {
	const form = e.target as HTMLFormElement
	const formData = new FormData(form)

	try {
		const res = await fetch("/api/providers/create", {
			method: "POST",
			body: formData,
		})

		if (res.ok) {
			const result = await res.json()
			console.log("Proveedor creado:", result)
			alert("Empresa registrada con éxito!")
			// Redirige al siguiente paso, por ejemplo, el formulario de productos
			window.location.href = "/products/create"
		} else {
			const errorText = await res.text()
			console.error("Error en la respuesta del servidor:", errorText)
			alert("Error al registrar la empresa.")
		}
	} catch (e) {
		console.error("Error enviando la solicitud:", e)
		alert("Error de conexión con el servidor.")
	}
}

async function handleHotelRoomsTypeForm(e: Event) {
	const form = e.target as HTMLFormElement
	const formData = new FormData(form)

	const hotelId = formData.get("hotelId")?.toString()
	if (!hotelId) {
		alert("Falta el ID del Hotel.")
		return
	}
	try {
		const res = await fetch(`/api/products/${hotelId}/rooms/create`, {
			method: "POST",
			body: formData,
		})

		if (res.ok) {
			console.log("Configuracion de habitación guardada")
			alert("Configuracion de habitaciones guardada exitosamente.")
			window.location.href = "/dashboard"
		} else {
			const errorText = await res.text()
			console.error("Error en la respuesta del servidor: ", errorText)
			alert("Error al guardar la configuración de la habitación.")
		}
	} catch (e) {
		console.error("Error enviando la solicitud: ", e)
		alert("Error de conexión con el servidor.")
	}
}

initializeFormHandler()
