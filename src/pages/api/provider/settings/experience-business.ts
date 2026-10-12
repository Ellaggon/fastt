import type { APIRoute } from "astro"
import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import { saveExperienceBusinessKinds } from "@/lib/provider/experience-business-kinds"
import { parseExperienceBusinessKinds } from "@/shared/domain/experience-classification"
export const POST: APIRoute = async ({ request }) => {
	const session = await getProviderSessionSurfaceFromRequest(request)
	if (!session) return Response.json({ error: "Inicia sesión para guardar." }, { status: 401 })
	if (!session.permissions.canEditProfile)
		return Response.json({ error: "No tienes permiso para editar el negocio." }, { status: 403 })
	const form = await request.formData()
	let kinds: string[]
	try {
		kinds = parseExperienceBusinessKinds(form.getAll("businessKind"))
	} catch {
		return Response.json({ error: "Selecciona tipos de negocio disponibles." }, { status: 400 })
	}
	try {
		await saveExperienceBusinessKinds({
			providerId: session.providerId,
			actorId: session.userId,
			kinds,
		})
		return Response.json({ ok: true })
	} catch (error) {
		console.error("experience.business.save_failed", error)
		return Response.json(
			{ error: "No pudimos guardar. Conservamos tu selección; vuelve a intentarlo." },
			{ status: 500 }
		)
	}
}
