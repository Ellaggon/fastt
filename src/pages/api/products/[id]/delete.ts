import type { APIRoute } from "astro"
import { productRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { deleteProduct } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const body = await request.json()
		const productId = String(body?.productId || "").trim()
		if (!productId || productId !== params.id)
			return Response.json({ error: "La experiencia seleccionada no es válida." }, { status: 400 })

		// obtener providerId desde la sesión
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) return new Response("Unauthorized", { status: 401 })

		return await deleteProduct({
			ensureOwned: (pid, prov) => productRepository.ensureProductDeletionOwned(pid, prov),
			deleteCascade: (pid) => productRepository.deleteProductCascade(pid, providerId),
			productId,
			providerId,
		})
	} catch (e) {
		console.error("products/delete error:", e)
		const cause = e as { code?: string; cause?: { code?: string } }
		if (cause.code === "23503" || cause.cause?.code === "23503")
			return Response.json(
				{
					error:
						"Esta experiencia tiene datos vinculados que deben conservarse. No se eliminó ningún dato. Retírala de venta o solicita revisión.",
					code: "linked_history",
				},
				{ status: 409 }
			)
		return Response.json(
			{
				error:
					"No pudimos eliminar la experiencia. No se eliminó ningún dato; vuelve a intentarlo.",
			},
			{ status: 500 }
		)
	}
}
