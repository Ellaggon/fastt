import type { APIRoute } from "astro"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { documentReuseSchema } from "@/lib/documents/document-reuse-contract"
import { reuseProviderDocument } from "@/lib/documents/document-reuse"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"

export const POST: APIRoute = async ({ request }) => {
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return Response.json({ error: "invalid_origin" }, { status: 403 })
	try {
		const input = documentReuseSchema.parse(Object.fromEntries(await request.formData()))
		const principal = await requireInternalPermission(request, "provider.document.review", {
			type: "provider",
			id: input.providerId,
		})
		await requireRecentInternalAuthentication({ request, user: principal.user })
		const result = await reuseProviderDocument(input, principal.user.id)
		await invalidateProvider(input.providerId)
		await invalidateProviderGovernance(input.providerId, "admin_document_reuse_requested")
		return Response.json({
			ok: true,
			...result,
			message: "Revisión creada con el archivo existente. La aprobación anterior no se transfirió.",
			redirectTo: `/admin/providers/${encodeURIComponent(input.providerId)}?result=document_reuse_pending`,
		})
	} catch (error) {
		if (error instanceof Response) return error
		console.error("provider.document.reuse_failed", error)
		return Response.json(
			{
				error: "document_reuse_requires_review",
				message:
					"No se pudo iniciar la revisión. Comprueba el sujeto, las fechas, la vigencia del archivo y que la definición esté publicada.",
			},
			{ status: 422 }
		)
	}
}
