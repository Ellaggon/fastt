import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	isPreparationPlaybookId,
	isPreparationVertical,
	normalizePreparationPath,
	savePreparationSession,
} from "@/lib/onboarding/preparationSession"
import { and, db, eq, Product } from "@/shared/infrastructure/db/compat"

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

	const product = await db
		.select({ id: Product.id })
		.from(Product)
		.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
		.limit(1)
	if (!product[0])
		return new Response(JSON.stringify({ error: "product_not_found" }), { status: 404 })

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
	})
	return new Response(JSON.stringify({ ok: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
