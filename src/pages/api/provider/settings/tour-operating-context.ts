import type { APIRoute } from "astro"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProduct, invalidateProvider } from "@/lib/cache/invalidation"
import { copyVerificationNavigationQuery } from "@/lib/verification/navigation"
import { routes } from "@/lib/routes"
import { experienceRequirementsHref } from "@/lib/verification/experience-requirements-navigation"
import {
	parseTourComplianceContext,
	saveTourComplianceContext,
} from "@/lib/tours/tour-compliance-context"
import { and, db, eq, first, Product } from "@/shared/infrastructure/db/compat"
import {
	tourOperationSchema,
	operationRole,
	operationActivityClasses,
} from "@/shared/domain/tour-operation"
import { ZodError } from "zod"

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
	return Response.redirect(new URL(experienceRequirementsHref(productId, target), request.url), 303)
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
		const operation = tourOperationSchema.parse(JSON.parse(String(form.get("operation") ?? "null")))
		const revision = Number(form.get("revision"))
		if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("invalid_tour_revision")
		const input = parseTourComplianceContext({
			operatingRole: operationRole(operation),
			activityClasses: operationActivityClasses(operation),
			jurisdictionCode: form.get("jurisdictionCode"),
			jurisdictionCodes: form.getAll("jurisdictionCodes").length
				? form.getAll("jurisdictionCodes")
				: undefined,
		})
		if (!input.operatingRole || !input.jurisdictionCode || input.activityClasses.length === 0) {
			return tourOperatingContextRedirect(request, productId, "invalid_context")
		}
		const saved = await saveTourComplianceContext({
			productId,
			providerId: session.provider.providerId,
			input,
			operation,
			expectedRevision: revision,
			actorUserId: session.user.id,
		})
		await Promise.all([
			invalidateProduct(productId),
			invalidateProvider(session.provider.providerId),
		])
		if (request.headers.get("accept")?.includes("application/json"))
			return Response.json({ ok: true, context: saved })
		return tourOperatingContextRedirect(request, productId, "context_saved")
	} catch (error) {
		if (error instanceof Error && error.message === "tour_context_forbidden")
			return request.headers.get("accept")?.includes("application/json")
				? Response.json({ error: "forbidden" }, { status: 403 })
				: tourOperatingContextRedirect(request, productId, "forbidden")
		if (
			!request.headers.get("accept")?.includes("application/json") &&
			(error instanceof ZodError || error instanceof SyntaxError)
		)
			return tourOperatingContextRedirect(request, productId, "invalid_context")
		if (request.headers.get("accept")?.includes("application/json")) {
			const code =
				(error as { code?: string; cause?: { code?: string } })?.code ??
				(error as { cause?: { code?: string } })?.cause?.code
			const conflict =
				(error instanceof Error && error.message === "tour_context_conflict") ||
				code === "40001" ||
				code === "40P01"
			const validation =
				error instanceof ZodError ||
				error instanceof SyntaxError ||
				String(error).includes("invalid_tour_")
			if (conflict || validation)
				return Response.json(
					{
						error: conflict ? "conflict" : "invalid_context",
						issues:
							error instanceof ZodError
								? error.issues.map((issue) => ({
										path: issue.path.join("."),
										message: issue.message,
									}))
								: [],
					},
					{ status: conflict ? 409 : 422 }
				)
		}
		if (error instanceof Error && error.message === "invalid_tour_jurisdiction")
			return tourOperatingContextRedirect(request, productId, "invalid_territory")
		if (String(error).includes("invalid_tour_"))
			return tourOperatingContextRedirect(request, productId, "invalid_context")
		throw error
	}
}
