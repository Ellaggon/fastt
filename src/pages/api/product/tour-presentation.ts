import { safeProductWorkspaceReturn } from "@/lib/auth/returnTo"
import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { productRepository } from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProduct, invalidateProvider } from "@/lib/cache/invalidation"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"
import { tourPreparationNextHref } from "@/lib/playbook/launch-tour"
import { saveTourPresentation, TourPresentationError } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request }) => {
	const json = (body: unknown, status = 200) => Response.json(body, { status })
	const user = await getUserFromRequest(request)
	if (!user) return json({ error: "Inicia sesión para guardar." }, 401)
	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) return json({ error: "No encontramos tu negocio." }, 403)
	try {
		const form = await request.formData()
		const input = {
			productId: String(form.get("productId") ?? ""),
			mode: String(form.get("mode") ?? ""),
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
			actorId: user.id,
		})
		await Promise.all([invalidateProduct(result.productId), invalidateProvider(providerId)])
		// Read-model refresh cannot turn a committed save into a false failure.
		try {
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
