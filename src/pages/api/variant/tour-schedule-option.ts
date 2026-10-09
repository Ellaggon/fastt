import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { requireProvider } from "@/lib/auth/requireProvider"
import { scheduleCreationSchema, createScheduleOption } from "@/lib/onboarding/tourScheduleCreation"
import { PreparationSessionError } from "@/lib/onboarding/preparationSessionContext"
import { invalidateVariant } from "@/lib/cache/invalidation"
const messages: Record<string, string> = {
	schedule_source_choice_changed:
		"La tarifa de origen fue cambiada en otra pestaña. Recarga y revisa la tarifa antes de guardar.",
	schedule_source_changed:
		"La opción de origen cambió. Recarga para revisar su configuración actual; tu borrador se conserva.",
	schedule_equivalent_exists:
		"Ya existe una opción con este horario, idioma y modalidad. Revisa las opciones existentes o confirma que necesitas otra.",
	schedule_price_not_reusable:
		"El precio de origen no está disponible para reutilizar. Configura un precio nuevo.",
	schedule_conditions_not_reusable:
		"Las condiciones de origen están pendientes o son incompatibles. Configúralas en el siguiente paso.",
	schedule_dated_conditions_not_reusable:
		"Las condiciones incluyen excepciones por fecha. Revisa condiciones nuevas para este horario.",
}
export const POST: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProvider(request)
		const input = scheduleCreationSchema.parse(await request.json())
		const result = await createScheduleOption(providerId, user.id, input)
		// Persistence succeeded even if refreshing read caches fails; retry returns the same option.
		let cacheRefreshPending = false
		try {
			await invalidateVariant(result.variantId, input.productId)
		} catch {
			cacheRefreshPending = true
		}
		return Response.json({ ok: true, ...result, cacheRefreshPending })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof ZodError)
			return Response.json(
				{ message: "Revisa el nombre, la hora y la configuración.", details: error.issues },
				{ status: 400 }
			)
		if (error instanceof PreparationSessionError)
			return Response.json(
				{
					error: error.code,
					message:
						messages[error.code] ||
						"No pudimos recuperar el origen de este horario. Vuelve a Opciones y horarios.",
				},
				{ status: error.status }
			)
		console.error("tour-schedule-option", error)
		return Response.json(
			{
				message:
					"No se pudo confirmar el guardado. Reintenta; se recuperará la misma opción si ya se guardó.",
			},
			{ status: 503 }
		)
	}
}
