import type { APIRoute } from "astro"
import { z } from "astro:content"
import { productRepository, subtypeRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { updateProductSubtype } from "@/modules/catalog/public"

const schema = z.object({
	productId: z.string().min(1),
	subtypeType: z.enum(["hotel", "tour", "package"]),
	subtype: z.record(z.any()).optional(),
})
export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })

		const body = await request.json()
		const parsed = schema.safeParse(body)
		if (!parsed.success)
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		const { productId, subtypeType, subtype } = parsed.data
		return updateProductSubtype({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			runInTransaction: (fn) => subtypeRepository.runInTransaction(fn),
			subtypeExists: (dbOrTx, pid, st) => subtypeRepository.subtypeExists(dbOrTx, pid, st),
			updateHotel: (dbOrTx, pid, data) => subtypeRepository.updateHotel(dbOrTx, pid, data),
			updateTour: (dbOrTx, pid, data) => subtypeRepository.updateTour(dbOrTx, pid, data),
			updatePackage: (dbOrTx, pid, data) => subtypeRepository.updatePackage(dbOrTx, pid, data),
			insertHotel: (dbOrTx, data) => subtypeRepository.insertHotel(dbOrTx, data),
			insertTour: (dbOrTx, data) => subtypeRepository.insertTour(dbOrTx, data),
			insertPackage: (dbOrTx, data) => subtypeRepository.insertPackage(dbOrTx, data),
			providerId,
			productId,
			subtypeType,
			subtype,
		})
	} catch (e) {
		console.error("update-subtype error:", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
