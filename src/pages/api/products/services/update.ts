import type { APIRoute } from "astro"
import { z } from "astro:content"
import { db, eq, ProductService } from "astro:db"
import { ensureProductOwnedByProvider } from "@/lib/db/product"
import { getProviderIdFromRequest } from "@/lib/db/provider"

const schema = z.object({
	productId: z.string().min(1),
	services: z.array(z.string()).default([]),
})

export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })

		const body = await request.json()
		const parsed = schema.safeParse(body)
		if (!parsed.success)
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })

		const { productId, services } = parsed.data

		// Verificar ownership
		const product = await ensureProductOwnedByProvider(productId, providerId)
		if (!product)
			return new Response(JSON.stringify({ error: "Not found or not owned" }), { status: 403 })

		// Actualizar dentro de transacción
		await db.transaction(async (tx) => {
			// eliminar los existentes
			await tx.delete(ProductService).where(eq(ProductService.productId, productId))
			// insertar los nuevos seleccionados
			for (const sid of services) {
				await tx.insert(ProductService).values({
					productId,
					serviceId: sid,
					isAvailable: true,
					isFree: true,
				})
			}
		})

		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	} catch (e) {
		console.error("update-services error:", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
