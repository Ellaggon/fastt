import type { APIRoute } from "astro"
import { db, eq, Provider, User } from "astro:db"
import { getSession } from "auth-astro/server"

export const POST: APIRoute = async ({ request }) => {
	try {
		// Obtenemos la session
		const session = await getSession(request)
		const email = session?.user?.email

		const formData = await request.formData()
		const userEmail = formData.get("userEmail")?.toString()
		const companyName = formData.get("companyName")?.toString()
		const contactName = formData.get("contactName")?.toString()
		const contactEmail = formData.get("contactEmail")?.toString()
		const phone = formData.get("phone")?.toString()
		const type = formData.get("type")?.toString()

		// Validar los datos
		if (!email) {
			return new Response(JSON.stringify({ error: "No hay email en la sesion" }), { status: 400 })
		}
		if (!companyName || !contactEmail || !type) {
			return new Response(JSON.stringify({ error: "Faltan campos obligatorios" }), { status: 400 })
		}

		// Insertar el nuevo proveedor en la base de datos
		const newProviderId = crypto.randomUUID()

		const providerData = {
			id: newProviderId,
			userEmail,
			companyName,
			contactName,
			contactEmail,
			phone,
			type,
		}

		await db.insert(Provider).values(providerData)
		await db.update(User).set({ providerId: newProviderId }).where(eq(User.email, email))

		return new Response(
			JSON.stringify({ message: "Proveedor creado con éxito", providerId: newProviderId }),
			{ status: 200 }
		)
	} catch (error) {
		console.error("Error creando proveedor:", error)
		return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 })
	}
}
