import { db } from "astro:db"
import { productRepository, subtypeRepository } from "@/container"

/**
 * Actualiza product y subtipo (orquesta lógica) dentro de una transacción:
 * - verifica ownership (mediante ensureProductOwnedByProvider)
 * - actualiza campos base del producto
 * - si cambia productType: borra subtype antiguo y crea el nuevo
 * - si no cambia: upsert del subtype
 */
export async function updateProductAndSubtype(
	productId: string,
	providerId: string,
	productFields: Partial<Record<string, any>>,
	subtypeType?: "hotel" | "tour" | "package", // opcional
	subtypePayload?: Record<string, any>
) {
	// ownership (esto puede ir fuera de la tx, no modifica nada)
	const product = await productRepository.ensureProductOwnedByProvider(productId, providerId)
	if (!product) throw new Error("Product not found or not owned")

	const prevType = String(product.productType || "").toLowerCase()
	const newType = (productFields.productType || prevType || "").toLowerCase()

	// abrir transacción
	return await db.transaction(async (tx) => {
		// 1) update product basic fields (filter allowed)
		const allowed = ["name", "description", "productType"]

		const toSet: Record<string, any> = { lastUpdated: new Date() }
		for (const k of allowed) if (k in productFields) toSet[k] = productFields[k]

		// aquí pasamos tx a la función, para que use la transacción
		// tx es compatible con el repositorio (mismo objeto que esperaba el helper legacy).
		await productRepository.updateProductFields(tx as any, productId, toSet)

		// 2) if no subtype provided, finish here
		if (!subtypeType) return

		const st = subtypeType.toLowerCase() as "hotel" | "tour" | "package"

		// If product type changed: delete old subtype rows & insert new
		if (st !== prevType) {
			if (prevType === "hotel") await subtypeRepository.deleteHotel(tx as any, productId)
			if (prevType === "tour") await subtypeRepository.deleteTour(tx as any, productId)
			if (prevType === "package") await subtypeRepository.deletePackage(tx as any, productId)

			if (st === "hotel")
				await subtypeRepository.insertHotel(tx as any, { productId, ...(subtypePayload || {}) })
			if (st === "tour")
				await subtypeRepository.insertTour(tx as any, { productId, ...(subtypePayload || {}) })
			if (st === "package")
				await subtypeRepository.insertPackage(tx as any, { productId, ...(subtypePayload || {}) })

			return
		}

		// same type: upsert subtype
		const exists = await subtypeRepository.subtypeExists(tx as any, productId, st)
		if (exists) {
			if (st === "hotel")
				await subtypeRepository.updateHotel(tx as any, productId, subtypePayload || {})
			if (st === "tour")
				await subtypeRepository.updateTour(tx as any, productId, subtypePayload || {})
			if (st === "package")
				await subtypeRepository.updatePackage(tx as any, productId, subtypePayload || {})
		} else {
			if (st === "hotel")
				await subtypeRepository.insertHotel(tx as any, { productId, ...(subtypePayload || {}) })
			if (st === "tour")
				await subtypeRepository.insertTour(tx as any, { productId, ...(subtypePayload || {}) })
			if (st === "package")
				await subtypeRepository.insertPackage(tx as any, { productId, ...(subtypePayload || {}) })
		}
	})
}
