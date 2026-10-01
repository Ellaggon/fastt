import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { loadTourCheckInRepair } from "@/lib/policies/tourCheckInRepair"
import { deactivatePolicyAssignmentCapa6UseCase } from "@/container/policies-write.container"
import { invalidatePolicyConditions, invalidateProduct } from "@/lib/cache/invalidation"
import { z } from "zod"
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	})
const input = z
	.object({
		ratePlanId: z.string().uuid(),
		assignmentId: z.string().uuid(),
		confirm: z.literal(true),
	})
	.strict()
export const GET: APIRoute = async ({ request, url }) => {
	const { providerId } = await requireProvider(request)
	const id = z.string().uuid().safeParse(url.searchParams.get("ratePlanId"))
	if (!id.success) return json(400, { message: "Selecciona una tarifa válida." })
	const result = await loadTourCheckInRepair(providerId, id.data)
	return result
		? json(200, result)
		: json(404, { message: "No encontramos una tarifa de tours de tu negocio." })
}
export const POST: APIRoute = async ({ request }) => {
	const { providerId, user } = await requireProvider(request)
	const parsed = input.safeParse(await request.json().catch(() => null))
	if (!parsed.success)
		return json(400, { message: "Revisa la tarifa y confirma el alcance del retiro." })
	const { ratePlanId, assignmentId } = parsed.data
	const result = await loadTourCheckInRepair(providerId, ratePlanId)
	if (!result) return json(404, { message: "No encontramos una tarifa de tours de tu negocio." })
	const assignment = result.assignments.find((item) => item.id === assignmentId)
	// Repeated requests still pass the transactional category, ownership and scope checks.
	try {
		const saved = await deactivatePolicyAssignmentCapa6UseCase({
			assignmentId,
			ownerProviderId: providerId,
			actorUserId: user.id,
			repairContext: result.context,
		})
		await invalidatePolicyConditions({
			scope: assignment?.scope ?? "product",
			scopeId: assignment?.scopeId ?? result.context.productId,
			productId: result.context.productId,
		})
		await invalidateProduct(result.context.productId)
		return json(200, {
			...saved,
			message: saved.deactivated
				? "Condición heredada retirada. Revisa las condiciones restantes."
				: "Esta condición ya estaba retirada.",
		})
	} catch (error) {
		const code = error instanceof Error ? error.message : ""
		if (
			[
				"TOUR_CHECKIN_REPAIR_CONTEXT_INVALID",
				"POLICY_ASSIGNMENT_OWNER_MISMATCH",
				"POLICY_ASSIGNMENT_NOT_FOUND",
				"POLICY_ASSIGNMENT_SCOPE_NOT_FOUND",
			].includes(code)
		)
			return json(409, {
				message: "La asignación no corresponde a esta oferta. Actualiza y vuelve a revisar.",
			})
		console.error("tour_checkin_repair_failed", { assignmentId, ratePlanId, error })
		return json(503, {
			message:
				"No pudimos completar la comprobación. Actualiza para verificar el estado guardado antes de reintentar.",
		})
	}
}
