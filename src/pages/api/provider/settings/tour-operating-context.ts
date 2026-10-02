import type { APIRoute } from "astro"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProduct, invalidateProvider } from "@/lib/cache/invalidation"
import { copyVerificationNavigationQuery } from "@/lib/verification/navigation"
import { routes } from "@/lib/routes"
import {
	parseTourComplianceContext,
	saveTourComplianceContext,
} from "@/lib/tours/tour-compliance-context"
import { and, db, eq, first, Product } from "@/shared/infrastructure/db/compat"

export function tourOperatingContextRedirect(request: Request, productId: string, result: string) {
	const target = copyVerificationNavigationQuery(
		new URL(routes.providerSettingsVerification(), request.url),
		new URL(request.url)
	)
	target.searchParams.set("line", "tour")
	target.searchParams.set("tab", "activity")
	target.searchParams.set("tourTab", "activity")
	if (productId) target.searchParams.set("experience", productId)
	target.searchParams.set(result === "context_saved" ? "result" : "error", result)
	target.hash = "tour-operating-context"
	return Response.redirect(target, 303)
}

export const POST: APIRoute = async ({ request }) => {
	const session = await requireProviderSessionSurface(request).catch((error: unknown) => {
		if (error instanceof Response) return error
		throw error
	})
	if (session instanceof Response) return session
	const form = await request.formData()
	const productId = String(form.get("productId") ?? "").trim()
	if (!session.provider.permissions?.canEditProfile)
		return tourOperatingContextRedirect(request, productId, "forbidden")
	const owned = await db
		.select({ id: Product.id, type: Product.productType })
		.from(Product)
		.where(and(eq(Product.id, productId), eq(Product.providerId, session.provider.providerId)))
		.then(first)
	if (!owned || owned.type !== "tour") return new Response("Tour no encontrado", { status: 404 })
	try {
		const input = parseTourComplianceContext({
			operatingRole: form.get("operatingRole"),
			activityClasses: form.getAll("activityClass"),
			jurisdictionCode: form.get("jurisdictionCode"),
		})
		if (!input.operatingRole || !input.jurisdictionCode || input.activityClasses.length === 0) {
			return tourOperatingContextRedirect(request, productId, "invalid_context")
		}
		await saveTourComplianceContext({ productId, providerId: session.provider.providerId, input })
		await Promise.all([
			invalidateProduct(productId),
			invalidateProvider(session.provider.providerId),
		])
		return tourOperatingContextRedirect(request, productId, "context_saved")
	} catch (error) {
		if (error instanceof Error && error.message === "invalid_tour_jurisdiction")
			return tourOperatingContextRedirect(request, productId, "invalid_territory")
		if (String(error).includes("invalid_tour_"))
			return tourOperatingContextRedirect(request, productId, "invalid_context")
		throw error
	}
}
