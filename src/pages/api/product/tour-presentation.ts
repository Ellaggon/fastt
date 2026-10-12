import { safeProductWorkspaceReturn } from "@/lib/auth/returnTo"
import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { productRepository } from "@/container"
import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import { invalidateProduct, invalidateProvider } from "@/lib/cache/invalidation"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"
import { tourPreparationNextHref } from "@/lib/playbook/launch-tour"
import { saveTourPresentation, TourPresentationError } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request }) => {
	const json = (body: unknown, status = 200) => Response.json(body, { status })
	const session = await getProviderSessionSurfaceFromRequest(request)
	if (!session) return json({ error: "Inicia sesión para guardar." }, 401)
	if (!session.permissions.canEditProfile)
		return json({ error: "No tienes permiso para editar esta experiencia." }, 403)
	const { providerId, userId } = session
	try {
		const form = await request.formData()
		const input = {
			productId: String(form.get("productId") ?? ""),
			mode: String(form.get("mode") ?? ""),
			experienceFormat: String(form.get("experienceFormat") ?? "").trim() || undefined,
			name: String(form.get("name") ?? ""),
			geoPlaceId: String(form.get("geoPlaceId") ?? ""),
			description: String(form.get("description") ?? ""),
			highlights: String(form.get("highlights") ?? "")
				.split(/\r?\n/)
				.map((item) => item.trim())
				.filter(Boolean),
			categoryIds: form.getAll("categoryId").map(String),
			intent: form.get("playbookNav") === "exit" ? "exit" : "continue",
		}
		const result = await saveTourPresentation({ repo: productRepository }, input, {
			providerId,
			actorId: userId,
		})
		// Read-model refresh cannot turn a committed save into a false failure.
		try {
			await Promise.all([invalidateProduct(result.productId), invalidateProvider(providerId)])
			await refreshProductOperationalSurfaceAfterMutation({
				productId: result.productId,
				providerId,
				request,
				source: "tour.presentation",
			})
		} catch (error) {
			console.error("Tour presentation read-model refresh failed", error)
		}
		const source = new URLSearchParams()
		for (const key of [
			"playbook",
			"flow",
			"tourFlowVersion",
			"variantId",
			"ratePlanId",
			"returnTo",
		]) {
			const value = String(form.get(key) ?? "")
			if (value) source.set(key, value)
		}
		const nextHref =
			input.intent === "exit" || !source.get("playbook")
				? (safeProductWorkspaceReturn(source.get("returnTo"), result.productId) ??
					`/product/${encodeURIComponent(result.productId)}`)
				: tourPreparationNextHref(
						source,
						{
							productId: result.productId,
							variantId: source.get("variantId") ?? undefined,
							ratePlanId: source.get("ratePlanId") ?? undefined,
						},
						"create"
					)
		return json({ ...result, nextHref })
	} catch (error) {
		if (error instanceof ZodError)
			return json(
				{ error: "Revisa los campos indicados.", fieldErrors: error.flatten().fieldErrors },
				400
			)
		if (error instanceof TourPresentationError)
			return json(
				{
					error: error.message,
					fieldErrors: error.field ? { [error.field]: [error.message] } : undefined,
				},
				error.status
			)
		console.error("Tour presentation save failed", error)
		return json({ error: "No pudimos guardar. Conservamos tus datos; vuelve a intentarlo." }, 500)
	}
}
