import { PreparationSessionError } from "@/lib/onboarding/preparationSessionContext"
import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	isPreparationPlaybookId,
	isPreparationVertical,
	normalizePreparationPath,
	savePreparationSession,
} from "@/lib/onboarding/preparationSession"

export const POST: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	if (!user?.id) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId)
		return new Response(JSON.stringify({ error: "provider_required" }), { status: 403 })

	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
	const productId = String(body?.productId ?? "").trim()
	const playbookId = body?.playbookId
	const vertical = body?.vertical
	const stepId = String(body?.stepId ?? "").trim()
	const lastPath = normalizePreparationPath(body?.lastPath)
	if (
		!productId ||
		!isPreparationPlaybookId(playbookId) ||
		!isPreparationVertical(vertical) ||
		!stepId ||
		!lastPath
	) {
		return new Response(JSON.stringify({ error: "invalid_preparation_session" }), { status: 400 })
	}

	if (body?.writeVersion !== 2)
		return new Response(
			JSON.stringify({
				error: "session_client_upgrade_required",
				message: "Recarga la página para guardar este recorrido.",
			}),
			{ status: 409 }
		)
	const navigationAt = new Date(String(body?.navigationAt ?? ""))
	try {
		await savePreparationSession({
			providerId,
			userId: user.id,
			productId,
			playbookId,
			vertical,
			stepId,
			variantId: String(body?.variantId ?? "").trim() || null,
			ratePlanId: String(body?.ratePlanId ?? "").trim() || null,
			lastPath,
			navigationAt,
		})
	} catch (error) {
		if (error instanceof PreparationSessionError)
			return new Response(JSON.stringify({ error: error.code }), {
				status: error.status,
				headers: { "Content-Type": "application/json" },
			})
		throw error
	}
	return new Response(JSON.stringify({ ok: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
