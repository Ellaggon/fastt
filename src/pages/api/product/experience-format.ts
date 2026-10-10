import type { APIRoute } from "astro"
import { z } from "zod"
import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import { invalidateProduct } from "@/lib/cache/invalidation"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"
import {
	EXPERIENCE_FORMATS,
	ExperienceFormatError,
	declareExperienceFormat,
} from "@/modules/catalog/public"

const declaration = z
	.object({ productId: z.string().uuid(), experienceFormat: z.enum(EXPERIENCE_FORMATS) })
	.strict()

export const POST: APIRoute = async ({ request }) => {
	const session = await getProviderSessionSurfaceFromRequest(request)
	if (!session) return Response.json({ error: "unauthorized" }, { status: 401 })
	if (!session.permissions.canEditProfile)
		return Response.json({ error: "forbidden" }, { status: 403 })
	const parsed = declaration.safeParse(await request.json().catch(() => null))
	if (!parsed.success)
		return Response.json(
			{ error: "invalid_declaration", fields: parsed.error.flatten().fieldErrors },
			{ status: 400 }
		)
	try {
		const result = await declareExperienceFormat({
			...parsed.data,
			providerId: session.providerId,
			actorUserId: session.userId,
		})
		try {
			await invalidateProduct(parsed.data.productId)
			await refreshProductOperationalSurfaceAfterMutation({
				productId: parsed.data.productId,
				providerId: session.providerId,
				request,
				source: "experience.format",
			})
		} catch (error) {
			console.error("experience.format.surface_refresh_failed", error)
		}
		return Response.json({ ok: true, ...result })
	} catch (error) {
		if (error instanceof ExperienceFormatError)
			return Response.json(
				{ error: error.code },
				{ status: error.code === "product_not_owned" ? 403 : 400 }
			)
		console.error("experience.format.declaration_failed", error)
		return Response.json({ error: "declaration_failed" }, { status: 500 })
	}
}
