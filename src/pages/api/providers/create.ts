import type { APIRoute } from "astro"
import { providerRepository } from "@/container"
import { createProvider } from "@/modules/catalog/public"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

export const POST: APIRoute = async ({ request }) => {
	try {
		// Obtenemos el usuario autenticado (Supabase-ready).
		const user = await getUserFromRequest(request)
		const email = user?.email

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

		return createProvider(
			{ repo: providerRepository },
			{
				sessionEmail: email,
				userEmail: userEmail ?? null,
				companyName,
				contactName: contactName ?? null,
				contactEmail,
				phone: phone ?? null,
				type,
			}
		)
	} catch (error) {
		console.error("Error creando proveedor:", error)
		return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 })
	}
}
